import { z } from "zod";
import type { ReviewQueue, ReviewStore } from "./ports";
import { verifyWebhookSignature } from "./github/webhook";

/**
 * Webhook ingress.
 *
 * This is the application's only entry point for review work, and the single
 * seam the test suite drives. It verifies, enqueues, and returns — nothing
 * downstream of the queue runs on the request path, because GitHub will mark
 * an endpoint unhealthy if it does not answer quickly.
 */

export interface WebhookDeps {
  secret: string;
  store: ReviewStore;
  queue: ReviewQueue;
}

/** The events we subscribe to. Anything else is acknowledged and ignored. */
const REVIEWABLE_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

const accountSchema = z.object({
  login: z.string(),
  type: z.string().default("Organization"),
});

const pullRequestEvent = z.object({
  action: z.string(),
  installation: z.object({ id: z.number() }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  pull_request: z.object({
    number: z.number(),
    body: z.string().nullable(),
    head: z.object({ sha: z.string() }),
  }),
});

const installationEvent = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: accountSchema,
  }),
});

export async function handleGithubWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  // The exact bytes GitHub sent. Signature verification happens against these,
  // before parsing, and before any side effect whatsoever.
  const rawBody = await request.text();

  const verified = verifyWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    secret: deps.secret,
  });
  if (!verified) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const event = request.headers.get("x-github-event");

  if (event === "pull_request") {
    const parsed = pullRequestEvent.safeParse(payload);
    if (!parsed.success) return new Response("ignored", { status: 202 });
    if (!REVIEWABLE_ACTIONS.has(parsed.data.action)) {
      return new Response("ignored", { status: 202 });
    }

    const { installation, repository, pull_request } = parsed.data;
    await deps.queue.enqueue({
      installationGithubId: installation.id,
      repositoryGithubId: repository.id,
      owner: repository.owner.login,
      repo: repository.name,
      pullRequestNumber: pull_request.number,
      headSha: pull_request.head.sha,
      pullRequestBody: pull_request.body ?? "",
    });

    return new Response("queued", { status: 202 });
  }

  if (event === "installation") {
    const parsed = installationEvent.safeParse(payload);
    if (!parsed.success) return new Response("ignored", { status: 202 });

    const { action, installation } = parsed.data;
    if (action === "created") {
      await deps.store.upsertInstallation({
        githubInstallationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
      });
    } else if (action === "deleted") {
      await deps.store.markInstallationDeleted(installation.id);
    }

    return new Response("ok", { status: 202 });
  }

  // `installation_repositories` needs no work: Repositories are discovered
  // lazily, the first time one produces a pull request.
  return new Response("ignored", { status: 202 });
}

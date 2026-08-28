import { handleGithubWebhook } from "../webhookHandler";
import { runReview } from "../pipeline";
import { InlineReviewQueue } from "../queue/inline";
import { signWebhookPayload } from "../github/webhook";
import { FakeGitHubClient } from "./fakeGitHub";
import { FakeCodebaseIndex, InMemoryReviewStore } from "./memoryStore";
import { ScriptedModelFactory, ScriptedModelProvider } from "./scriptedModel";

/**
 * The single test seam.
 *
 * A test constructs a fixture webhook payload, signs it, delivers it to the
 * handler, and asserts on what the fake GitHub client received. Everything
 * between — signature verification, issue link resolution, criteria
 * extraction, the Producer, the Verifier, index retrieval, comment rendering —
 * is exercised as a unit and none of it is addressed directly.
 */

export const SECRET = "test-webhook-secret";
export const INSTALLATION_ID = 42;
export const REPO_ID = 7;
export const OWNER = "acme";
export const REPO = "app";

export interface HarnessOptions {
  scripts?: Partial<Record<"extract-criteria" | "produce", string[]>>;
  /** `false` puts the Installation in the no-Provider-Key state. */
  hasProviderKey?: boolean;
  /** `true` skips seeding, leaving the Repository unindexed. */
  unindexed?: boolean;
}

export interface DeliverPullRequestInput {
  action?: "opened" | "synchronize" | "reopened" | "closed";
  number?: number;
  headSha?: string;
  body?: string;
}

export async function createHarness(options: HarnessOptions = {}) {
  const store = new InMemoryReviewStore();
  const github = new FakeGitHubClient();
  const index = new FakeCodebaseIndex();
  const model = new ScriptedModelProvider(options.scripts ?? {});

  await store.upsertInstallation({
    githubInstallationId: INSTALLATION_ID,
    accountLogin: OWNER,
    accountType: "Organization",
  });

  const queue = new InlineReviewQueue((job) =>
    runReview(job, {
      store,
      githubFor: () => Promise.resolve(github),
      models: new ScriptedModelFactory(
        options.hasProviderKey === false ? null : model,
      ),
      index,
    }),
  );

  async function deliver(event: string, payload: unknown, opts?: { signature?: string }) {
    const rawBody = JSON.stringify(payload);
    const request = new Request("https://example.test/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": event,
        "x-hub-signature-256":
          opts?.signature ?? signWebhookPayload(rawBody, SECRET),
      },
      body: rawBody,
    });
    return handleGithubWebhook(request, { secret: SECRET, store, queue });
  }

  async function deliverPullRequest(input: DeliverPullRequestInput = {}) {
    return deliver(
      "pull_request",
      {
        action: input.action ?? "opened",
        installation: { id: INSTALLATION_ID },
        repository: {
          id: REPO_ID,
          name: REPO,
          owner: { login: OWNER },
        },
        pull_request: {
          number: input.number ?? 1,
          body: input.body ?? "Closes #142",
          head: { sha: input.headSha ?? "a4f9c21aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        },
      },
    );
  }

  /** Marks the Repository indexed so a test does not have to run indexing. */
  async function seedIndexed() {
    const repository = await store.upsertRepository({
      githubRepoId: REPO_ID,
      owner: OWNER,
      name: REPO,
      installationId: (await store.findInstallation(INSTALLATION_ID))!.id,
    });
    await store.markIndexed(repository.id);
  }

  if (!options.unindexed) await seedIndexed();

  return { store, github, index, model, deliver, deliverPullRequest };
}

/** Rows of the rendered criteria table, one per reported Acceptance Criterion. */
export function criterionRows(commentBody: string): string[] {
  return commentBody
    .split("\n")
    .filter((line) => /^\|\s*(✅|⚠️|❔)\s*\|/.test(line));
}

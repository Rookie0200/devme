import { App } from "octokit";
import { env } from "@/env";
import type { CheckRunInput, GitHubClient, IssueRef } from "../ports";

/**
 * Repository access via a GitHub App installation token — never a user OAuth
 * token, never a stored personal access token. See docs/adr/0001.
 *
 * There is deliberately no module-level client here: one is constructed per
 * Installation from a freshly minted token, so an Installation can never see a
 * repository outside its own grant.
 */

/** Env vars often carry the PEM with literal `\n` rather than real newlines. */
function privateKey(): string {
  return env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
}

let app: App | undefined;
function githubApp(): App {
  app ??= new App({
    appId: env.GITHUB_APP_ID,
    privateKey: privateKey(),
    webhooks: { secret: env.GITHUB_WEBHOOK_SECRET },
  });
  return app;
}

type InstallationOctokit = Awaited<
  ReturnType<App["getInstallationOctokit"]>
>;

/**
 * A short-lived installation token, for tools that need the raw credential
 * rather than an Octokit instance — the repository loader used by indexing.
 */
export async function mintInstallationToken(
  installationGithubId: number,
): Promise<string> {
  const { data } = await githubApp().octokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationGithubId },
  );
  return data.token;
}

/**
 * How far back to look for a delivery's numeric id before giving up.
 *
 * GitHub itself only retains a limited, recent window of deliveries — a
 * match beyond this many of the App's most recent deliveries (across every
 * Installation, not just the one being retried) is not findable regardless
 * of how far the search goes.
 */
const DELIVERY_LOOKUP_PAGES = 5;

/**
 * The redelivery endpoint takes a delivery's integer `id`, which the original
 * webhook request never carries — it only carries the `guid`, matching
 * `X-GitHub-Delivery`, and that is all `ReviewRun.githubDeliveryId` stores.
 * The only bridge from one to the other is listing recent deliveries and
 * matching by guid.
 *
 * `null` when no match is found within the lookback window — either the
 * delivery has aged out of GitHub's retention, or the guid never belonged to
 * this App's webhook at all.
 */
async function findDeliveryIdByGuid(guid: string): Promise<number | null> {
  const iterator = githubApp().octokit.paginate.iterator(
    "GET /app/hook/deliveries",
    { per_page: 100 },
  );

  let pages = 0;
  for await (const { data } of iterator) {
    const match = data.find((delivery) => delivery.guid === guid);
    if (match) return match.id;
    pages += 1;
    if (pages >= DELIVERY_LOOKUP_PAGES) return null;
  }
  return null;
}

/**
 * Asks GitHub to redeliver a past webhook delivery.
 *
 * Authenticated as the App itself (the App's own JWT), not as an
 * Installation — this is an App-level administrative action, unrelated to any
 * one Installation's grant. It resends the exact bytes GitHub originally
 * sent, through the same webhook route and signature check, so it needs no
 * pipeline logic of its own: a redelivery is already a first-class case
 * `ReviewStore.startRun` is built to expect.
 *
 * @throws Error if the delivery cannot be found (aged out of GitHub's
 * retention window) or GitHub refuses the redelivery itself.
 */
export async function redeliverWebhookDelivery(
  deliveryGuid: string,
): Promise<void> {
  const deliveryId = await findDeliveryIdByGuid(deliveryGuid);
  if (deliveryId === null) {
    throw new Error(
      "This delivery is no longer available from GitHub to redeliver.",
    );
  }
  await githubApp().octokit.request(
    "POST /app/hook/deliveries/{delivery_id}/attempts",
    { delivery_id: deliveryId },
  );
}

export class OctokitGitHubClient implements GitHubClient {
  constructor(private readonly octokit: InstallationOctokit) {}

  static async forInstallation(
    installationGithubId: number,
  ): Promise<OctokitGitHubClient> {
    const octokit = await githubApp().getInstallationOctokit(
      installationGithubId,
    );
    return new OctokitGitHubClient(octokit);
  }

  async getIssue(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<IssueRef | null> {
    try {
      const { data } = await this.octokit.request(
        "GET /repos/{owner}/{repo}/issues/{issue_number}",
        { owner: input.owner, repo: input.repo, issue_number: input.number },
      );
      // A pull request is also an issue on this endpoint. Judging a pull
      // request against another pull request's body is not a specification.
      if (data.pull_request) return null;
      return {
        number: data.number,
        title: data.title,
        body: data.body ?? "",
      };
    } catch (error) {
      // Not visible to this Installation, or gone. Either way there is no
      // specification to judge against, which the caller handles.
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getPullRequestDiff(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<string> {
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner: input.owner,
        repo: input.repo,
        pull_number: input.number,
        mediaType: { format: "diff" },
      },
    );
    // With the diff media type the body is the raw patch, not the JSON the
    // generated types describe.
    return response.data as unknown as string;
  }

  async getFileAtRef(input: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
  }): Promise<string | null> {
    try {
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: input.owner,
          repo: input.repo,
          path: input.path,
          ref: input.ref,
          mediaType: { format: "raw" },
        },
      );
      return response.data as unknown as string;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async createComment(input: {
    owner: string;
    repo: string;
    number: number;
    body: string;
  }): Promise<{ id: number }> {
    const { data } = await this.octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: input.owner,
        repo: input.repo,
        issue_number: input.number,
        body: input.body,
      },
    );
    return { id: data.id };
  }

  async updateComment(input: {
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }): Promise<void> {
    await this.octokit.request(
      "PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}",
      {
        owner: input.owner,
        repo: input.repo,
        comment_id: input.commentId,
        body: input.body,
      },
    );
  }

  async createCheckRun(input: CheckRunInput): Promise<void> {
    await this.octokit.request("POST /repos/{owner}/{repo}/check-runs", {
      owner: input.owner,
      repo: input.repo,
      name: input.title,
      head_sha: input.headSha,
      status: "completed",
      // Never failing and never blocking at MVP: a wrong verdict must not be
      // able to stop a team from merging.
      conclusion: input.conclusion,
      output: { title: input.title, summary: input.summary },
    });
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 404
  );
}

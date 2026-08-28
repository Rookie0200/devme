import type {
  CodebaseIndex,
  GitHubClient,
  ModelProviderFactory,
  ReviewJob,
  ReviewStore,
} from "./ports";
import type { Criterion, Verdict } from "./types";
import { criterionKey } from "./types";
import { resolveLinkedIssues } from "./github/issueLinks";
import { resolveAcceptanceCriteria } from "./criteria/extract";
import { produceSpecAdherence } from "./producer/specAdherence";
import { verify } from "./verifier/verify";
import {
  renderDeclinedComment,
  renderIndexingComment,
  renderMissingProviderKeyComment,
  renderReviewComment,
} from "./render/comment";

export interface PipelineDeps {
  store: ReviewStore;
  /** Constructed per Installation from a freshly minted installation token. */
  githubFor: (installationGithubId: number) => Promise<GitHubClient>;
  models: ModelProviderFactory;
  index: CodebaseIndex;
}

const CHECK_RUN_TITLE = "Spec adherence";

/**
 * One Review Run, from a dequeued job to a comment on the pull request.
 *
 * Every exit path either revises the Review's single comment or leaves it
 * untouched — none of them appends a second one, and none of them leaves a
 * half-written one behind.
 */
export async function runReview(
  job: ReviewJob,
  deps: PipelineDeps,
): Promise<void> {
  const { store, models, index } = deps;

  const installation = await store.findInstallation(job.installationGithubId);
  // An event for an installation we have never seen — or one that has been
  // deleted — is dropped rather than guessed at.
  if (!installation) return;

  const repository = await store.upsertRepository({
    githubRepoId: job.repositoryGithubId,
    owner: job.owner,
    name: job.repo,
    installationId: installation.id,
  });

  const github = await deps.githubFor(job.installationGithubId);
  const review = await store.ensureReview({
    repositoryId: repository.id,
    pullRequestNumber: job.pullRequestNumber,
  });

  // The Review owns exactly one comment. Tracked locally so that two writes
  // within a single Run — the indexing notice and then the report — revise the
  // same comment rather than posting twice.
  let commentId = review.commentId;
  const upsertComment = async (body: string) => {
    if (commentId !== null) {
      await github.updateComment({
        owner: job.owner,
        repo: job.repo,
        commentId,
        body,
      });
      return;
    }
    const created = await github.createComment({
      owner: job.owner,
      repo: job.repo,
      number: job.pullRequestNumber,
      body,
    });
    commentId = created.id;
    await store.setReviewComment({ reviewId: review.id, commentId });
  };

  const neutralCheckRun = (summary: string) =>
    github.createCheckRun({
      owner: job.owner,
      repo: job.repo,
      headSha: job.headSha,
      title: CHECK_RUN_TITLE,
      summary,
      conclusion: "neutral",
    });

  // --- Unlinked -----------------------------------------------------------
  const linkedIssues = resolveLinkedIssues(job.pullRequestBody);
  if (linkedIssues.length === 0) {
    // The *comment* is posted once, so a long-running branch is not nagged on
    // every push. The Check Run is per commit, so it is created every time —
    // otherwise a new push shows no check at all against its head.
    if (review.declinedAt === null) {
      await upsertComment(renderDeclinedComment());
      await store.markDeclined(review.id);
    }
    await neutralCheckRun("No linked issue — no review performed.");
    return;
  }

  // --- Provider Key -------------------------------------------------------
  const model = await models.forInstallation(installation.id);
  if (!model) {
    await upsertComment(renderMissingProviderKeyComment());
    await neutralCheckRun("No provider key configured — no review performed.");
    return;
  }

  // --- Duplicate delivery -------------------------------------------------
  const run = await store.startRun({
    reviewId: review.id,
    headSha: job.headSha,
  });
  // A Run for this head commit already exists. Returning here is what stops a
  // GitHub redelivery charging the customer's Provider Key twice.
  if (!run) return;

  try {
    // --- Lazy indexing ----------------------------------------------------
    if (repository.indexedAt === null) {
      await upsertComment(renderIndexingComment());
      await store.markIndexingStarted(repository.id);
      const indexed = await index.ensureIndexed({
        repositoryId: repository.id,
        owner: job.owner,
        repo: job.repo,
      });
      // Only record success when there is something to search. An indexing
      // provider outage otherwise marks the Repository indexed permanently,
      // and every later review runs against an empty index with no retry.
      // The review still proceeds — the Codebase Index is context, not a
      // precondition — it is just less informed than it will be next time.
      if (indexed) await store.markIndexed(repository.id);
    }

    // --- Determining the specification ------------------------------------
    const criteria: Criterion[] = [];
    for (const link of linkedIssues) {
      const issue = await github.getIssue({
        owner: link.owner ?? job.owner,
        repo: link.repo ?? job.repo,
        number: link.number,
      });
      if (!issue) continue;
      criteria.push(
        ...(await resolveAcceptanceCriteria({
          store,
          model,
          repositoryId: repository.id,
          issue,
        })),
      );
    }

    const diff = await github.getPullRequestDiff({
      owner: job.owner,
      repo: job.repo,
      number: job.pullRequestNumber,
    });

    const codebaseContext = await index.search({
      repositoryId: repository.id,
      query: criteria.map((c) => c.text).join("\n"),
    });

    // --- Produce, then verify ---------------------------------------------
    const { proposals, completion } = await produceSpecAdherence({
      model,
      criteria,
      diff,
      codebaseContext,
    });

    // The Verifier reads files itself rather than trusting the Producer's
    // quotes. Cached because it will ask for the same file repeatedly.
    const fileCache = new Map<string, string | null>();
    const locate = async (path: string) => {
      const cached = fileCache.get(path);
      if (cached !== undefined) return cached;
      const contents = await github.getFileAtRef({
        owner: job.owner,
        repo: job.repo,
        path,
        ref: job.headSha,
      });
      fileCache.set(path, contents);
      return contents;
    };

    const verified = await verify({ proposals, locate, diff, codebaseContext });

    // Read before completing this Run, so "since last push" compares against
    // the previous Run rather than against what we are about to write.
    const previous = await store.previousResults({
      reviewId: review.id,
      beforeRunId: run.id,
    });
    const previousVerdicts = new Map<string, Verdict>(
      previous.map((r) => [r.criterionKey, r.verdict]),
    );

    // Resolve keys against the exact criteria this Run judged. An edited
    // Issue leaves older generations behind sharing the same key, so this
    // mapping cannot be redone later from the key alone.
    const criterionIdByKey = new Map(
      criteria
        .filter((c): c is Criterion & { id: string } => c.id !== undefined)
        .map((c) => [criterionKey(c.issueNumber, c.ordinal), c.id]),
    );

    await store.completeRun({
      runId: run.id,
      model: completion.model,
      costUsd: completion.costUsd,
      results: verified.results.flatMap((result) => {
        const criterionId = criterionIdByKey.get(result.criterionKey);
        return criterionId ? [{ ...result, criterionId }] : [];
      }),
      findings: verified.findings,
    });

    const runCount = await store.countRuns(review.id);
    await upsertComment(
      renderReviewComment({
        criteria,
        results: verified.results,
        findings: verified.findings,
        previousVerdicts,
        runCount,
        headSha: job.headSha,
      }),
    );

    await neutralCheckRun(summarise(criteria, verified.results));
  } catch (error) {
    // Leave the comment as it stands. A transient model or API failure should
    // be recoverable by pushing again, not leave a half-written report.
    await store.failRun(run.id);
    throw error;
  }
}

function summarise(
  criteria: Criterion[],
  results: Array<{ criterionKey: string; verdict: Verdict }>,
): string {
  const counts = { satisfied: 0, unsatisfied: 0, unclear: 0 };
  for (const result of results) counts[result.verdict] += 1;

  const reported = new Set(results.map((r) => r.criterionKey));
  const unreported = criteria.filter(
    (c) => !reported.has(criterionKey(c.issueNumber, c.ordinal)),
  ).length;

  const parts = [
    `${counts.satisfied} satisfied`,
    `${counts.unsatisfied} unsatisfied`,
    `${counts.unclear} unclear`,
  ];
  if (unreported > 0) parts.push(`${unreported} not reported`);
  return parts.join(" · ");
}

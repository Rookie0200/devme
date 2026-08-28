import { client, withDbRetry } from "@/server/db";
import type {
  InstallationRecord,
  PersistRunInput,
  RepositoryRecord,
  ReviewOutcomeReason,
  ReviewRecord,
  ReviewRunRecord,
  ReviewStore,
  StoredCriterionResult,
} from "../ports";
import type { Criterion } from "../types";
import { criterionKey } from "../types";

/**
 * The production `ReviewStore`.
 *
 * Kept deliberately thin — it is the one piece of the pipeline the seam test
 * suite does not exercise, because the suite runs against the in-memory store
 * so it needs no live Postgres.
 */
export class PrismaReviewStore implements ReviewStore {
  async upsertInstallation(input: {
    githubInstallationId: number;
    accountLogin: string;
    accountType: string;
  }): Promise<InstallationRecord> {
    const record = await withDbRetry(() =>
      client.installation.upsert({
        where: { githubInstallationId: BigInt(input.githubInstallationId) },
        // A reinstall after a delete revives the row rather than orphaning its
        // Review history.
        update: {
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          deletedAt: null,
        },
        create: {
          githubInstallationId: BigInt(input.githubInstallationId),
          accountLogin: input.accountLogin,
          accountType: input.accountType,
        },
      }),
    );
    return toInstallation(record);
  }

  async markInstallationDeleted(githubInstallationId: number): Promise<void> {
    await withDbRetry(() =>
      client.installation.updateMany({
        where: { githubInstallationId: BigInt(githubInstallationId) },
        data: { deletedAt: new Date() },
      }),
    );
  }

  async findInstallation(
    githubInstallationId: number,
  ): Promise<InstallationRecord | null> {
    const record = await client.installation.findFirst({
      where: {
        githubInstallationId: BigInt(githubInstallationId),
        deletedAt: null,
      },
    });
    return record ? toInstallation(record) : null;
  }

  async upsertRepository(input: {
    githubRepoId: number;
    owner: string;
    name: string;
    installationId: string;
  }): Promise<RepositoryRecord> {
    const record = await withDbRetry(() =>
      client.repository.upsert({
        where: { githubRepoId: BigInt(input.githubRepoId) },
        // A rename or a transfer between installations must not create a
        // second Repository and lose the Codebase Index.
        update: {
          owner: input.owner,
          name: input.name,
          installationId: input.installationId,
        },
        create: {
          githubRepoId: BigInt(input.githubRepoId),
          owner: input.owner,
          name: input.name,
          installationId: input.installationId,
        },
      }),
    );
    return {
      id: record.id,
      installationId: record.installationId,
      owner: record.owner,
      name: record.name,
      indexedAt: record.indexedAt,
      indexingStartedAt: record.indexingStartedAt,
    };
  }

  async markIndexingStarted(repositoryId: string): Promise<void> {
    await withDbRetry(() =>
      client.repository.update({
        where: { id: repositoryId },
        data: { indexingStartedAt: new Date() },
      }),
    );
  }

  async markIndexed(repositoryId: string): Promise<void> {
    await withDbRetry(() =>
      client.repository.update({
        where: { id: repositoryId },
        data: { indexedAt: new Date() },
      }),
    );
  }

  async ensureReview(input: {
    repositoryId: string;
    pullRequestNumber: number;
    title: string;
  }): Promise<ReviewRecord> {
    const record = await withDbRetry(() =>
      client.review.upsert({
        where: {
          repositoryId_pullRequestNumber: {
            repositoryId: input.repositoryId,
            pullRequestNumber: input.pullRequestNumber,
          },
        },
        // Refreshed on every delivery, so a pull request renamed after it was
        // opened is recorded under the name it has now.
        update: { title: input.title },
        create: {
          repositoryId: input.repositoryId,
          pullRequestNumber: input.pullRequestNumber,
          title: input.title,
        },
      }),
    );
    return {
      id: record.id,
      repositoryId: record.repositoryId,
      pullRequestNumber: record.pullRequestNumber,
      commentId: record.commentId === null ? null : Number(record.commentId),
    };
  }

  async setReviewComment(input: {
    reviewId: string;
    commentId: number;
  }): Promise<void> {
    await withDbRetry(() =>
      client.review.update({
        where: { id: input.reviewId },
        data: { commentId: BigInt(input.commentId) },
      }),
    );
  }

  async hasDeclinedRun(reviewId: string): Promise<boolean> {
    const declined = await withDbRetry(() =>
      client.reviewRun.findFirst({
        where: { reviewId, status: "declined" },
        select: { id: true },
      }),
    );
    return declined !== null;
  }

  async startRun(input: {
    reviewId: string;
    headSha: string;
  }): Promise<ReviewRunRecord | null> {
    // The unique constraint on (reviewId, headSha) is the duplicate-delivery
    // guard: two concurrent deliveries race here and exactly one wins.
    const existing = await client.reviewRun.findUnique({
      where: {
        reviewId_headSha: {
          reviewId: input.reviewId,
          headSha: input.headSha,
        },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      // A Run that failed is not a Run that was processed. Blocking here would
      // make a transient model or API error permanent for that commit — the
      // BullMQ retry and any manual redelivery would both exit silently, and
      // only a fresh push could recover.
      //
      // Nor is a Run that only declined. A pull request declined as Unlinked
      // is fixed by adding the link and reopening, which fires against this
      // same head commit; blocking here would make it permanently unreviewable
      // with no error raised anywhere.
      if (existing.status !== "failed" && existing.status !== "declined") {
        return null;
      }
      await client.reviewRun.update({
        where: { id: existing.id },
        data: {
          status: "running",
          outcomeReason: null,
          costUsd: null,
          startedAt: new Date(),
          completedAt: null,
        },
      });
      return { id: existing.id, headSha: input.headSha };
    }

    try {
      const run = await client.reviewRun.create({
        data: { reviewId: input.reviewId, headSha: input.headSha },
      });
      return { id: run.id, headSha: run.headSha };
    } catch (error) {
      // Lost the race against a concurrent delivery.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async completeRun(input: PersistRunInput): Promise<void> {
    // The caller resolved criterion ids against the exact criteria it
    // reviewed. Looking them up here by `issueNumber:ordinal` instead would be
    // ambiguous, because an edited Issue leaves several generations of
    // criteria sharing that key.
    await withDbRetry(() =>
      client.$transaction([
        client.criterionResult.createMany({
          data: input.results.map((result) => ({
            reviewRunId: input.runId,
            criterionId: result.criterionId,
            verdict: result.verdict,
            evidence: result.evidence,
            evidenceFile: result.evidenceFile,
            evidenceStartLine: result.evidenceStartLine,
            evidenceEndLine: result.evidenceEndLine,
          })),
        }),
        client.finding.createMany({
          data: input.findings.map((finding) => ({
            reviewRunId: input.runId,
            producer: finding.producer,
            body: finding.body,
            evidenceFile: finding.evidenceFile,
            evidenceStartLine: finding.evidenceStartLine,
            evidenceEndLine: finding.evidenceEndLine,
          })),
        }),
        client.reviewRun.update({
          where: { id: input.runId },
          data: {
            status: "completed",
            model: input.model,
            costUsd: input.costUsd,
            completedAt: new Date(),
          },
        }),
      ]),
    );
  }

  async declineRun(input: {
    runId: string;
    outcomeReason: "unlinked" | "no_provider_key";
  }): Promise<void> {
    await withDbRetry(() =>
      client.reviewRun.update({
        where: { id: input.runId },
        data: {
          status: "declined",
          outcomeReason: input.outcomeReason,
          completedAt: new Date(),
        },
      }),
    );
  }

  async failRun(input: {
    runId: string;
    outcomeReason: ReviewOutcomeReason;
    costUsd?: number;
  }): Promise<void> {
    await withDbRetry(() =>
      client.reviewRun.update({
        where: { id: input.runId },
        data: {
          status: "failed",
          outcomeReason: input.outcomeReason,
          // Left null when nothing is known. A Run that failed before the
          // first model call genuinely cost nothing; one that failed after the
          // Producer billed did not, and recording either as `0` would make
          // any total built on this column a lie.
          costUsd: input.costUsd ?? null,
          completedAt: new Date(),
        },
      }),
    );
  }

  async recordProviderAuthFailure(installationId: string): Promise<void> {
    // `updateMany` rather than `update`: an Installation without a Provider
    // Key cannot reach a provider_auth failure, but a key removed between the
    // failure and this write should be a no-op, not a crash.
    await withDbRetry(() =>
      client.providerKey.updateMany({
        where: { installationId },
        data: { lastAuthFailureAt: new Date() },
      }),
    );
  }

  async previousResults(input: {
    reviewId: string;
    beforeRunId: string;
  }): Promise<StoredCriterionResult[]> {
    const current = await client.reviewRun.findUnique({
      where: { id: input.beforeRunId },
      select: { startedAt: true },
    });
    if (!current) return [];

    // The most recent *completed* Run before this one, so a failed Run in
    // between does not erase the comparison.
    const previous = await client.reviewRun.findFirst({
      where: {
        reviewId: input.reviewId,
        status: "completed",
        startedAt: { lt: current.startedAt },
      },
      orderBy: { startedAt: "desc" },
      select: {
        results: {
          select: {
            verdict: true,
            criterion: { select: { issueNumber: true, ordinal: true } },
          },
        },
      },
    });
    if (!previous) return [];

    return previous.results.map((result) => ({
      criterionKey: criterionKey(
        result.criterion.issueNumber,
        result.criterion.ordinal,
      ),
      verdict: result.verdict,
    }));
  }

  countRuns(reviewId: string): Promise<number> {
    return client.reviewRun.count({
      where: { reviewId, status: "completed" },
    });
  }

  async criteriaForIssue(input: {
    repositoryId: string;
    issueNumber: number;
    issueBodyHash: string;
  }): Promise<Criterion[] | null> {
    // Filtering on the hash rather than checking it afterwards: older
    // generations for the same Issue are kept on purpose, so "some row has a
    // different hash" is the normal case, not a staleness signal.
    const stored = await client.acceptanceCriterion.findMany({
      where: {
        repositoryId: input.repositoryId,
        issueNumber: input.issueNumber,
        issueBodyHash: input.issueBodyHash,
      },
      orderBy: { ordinal: "asc" },
    });
    if (stored.length === 0) return null;

    return stored.map((row) => ({
      id: row.id,
      issueNumber: row.issueNumber,
      issueTitle: row.issueTitle,
      ordinal: row.ordinal,
      text: row.text,
    }));
  }

  async recordCriteria(input: {
    repositoryId: string;
    issueNumber: number;
    issueTitle: string;
    issueBodyHash: string;
    criteria: Criterion[];
  }): Promise<Criterion[]> {
    return withDbRetry(async () => {
      // Deliberately no delete of earlier generations: `CriterionResult`
      // cascades from `AcceptanceCriterion`, so removing the old rows would
      // erase every prior Review Run's verdicts the moment someone edits the
      // Issue — and those verdicts are exactly what "satisfied since last
      // push" is computed from.
      const created = await Promise.all(
        input.criteria.map((criterion) =>
          client.acceptanceCriterion.create({
            data: {
              repositoryId: input.repositoryId,
              issueNumber: input.issueNumber,
              issueTitle: input.issueTitle,
              issueBodyHash: input.issueBodyHash,
              ordinal: criterion.ordinal,
              text: criterion.text,
            },
          }),
        ),
      );

      return created.map((row) => ({
        id: row.id,
        issueNumber: row.issueNumber,
        issueTitle: row.issueTitle,
        ordinal: row.ordinal,
        text: row.text,
      }));
    });
  }
}

function toInstallation(record: {
  id: string;
  githubInstallationId: bigint;
  accountLogin: string;
}): InstallationRecord {
  return {
    id: record.id,
    githubInstallationId: Number(record.githubInstallationId),
    accountLogin: record.accountLogin,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

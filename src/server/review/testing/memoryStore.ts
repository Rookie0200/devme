import type {
  CodebaseIndex,
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
import { isRunAbandoned } from "../runLifecycle";

interface StoredRun {
  id: string;
  reviewId: string;
  headSha: string;
  status: "running" | "completed" | "failed" | "declined";
  outcomeReason: ReviewOutcomeReason | null;
  costUsd: number | null;
  startedAt: Date;
  results: StoredCriterionResult[];
  githubDeliveryId: string | null;
}

/**
 * An in-memory `ReviewStore`.
 *
 * The pipeline reaches persistence through a port so the suite runs without a
 * live Postgres. The cost of that choice is that `PrismaReviewStore` is not
 * exercised here; it is kept thin deliberately.
 */
export class InMemoryReviewStore implements ReviewStore {
  private readonly installations = new Map<number, InstallationRecord>();
  private readonly repositories = new Map<string, RepositoryRecord>();
  private readonly reviews = new Map<string, ReviewRecord>();
  private readonly runs: StoredRun[] = [];
  readonly providerAuthFailures = new Set<string>();
  private readonly criteria = new Map<
    string,
    { hash: string; criteria: Criterion[] }
  >();

  private sequence = 0;
  private id(prefix: string): string {
    return `${prefix}-${++this.sequence}`;
  }

  upsertInstallation(input: {
    githubInstallationId: number;
    accountLogin: string;
    accountType: string;
  }): Promise<InstallationRecord> {
    const existing = this.installations.get(input.githubInstallationId);
    const record: InstallationRecord = existing ?? {
      id: this.id("inst"),
      githubInstallationId: input.githubInstallationId,
      accountLogin: input.accountLogin,
    };
    record.accountLogin = input.accountLogin;
    this.installations.set(input.githubInstallationId, record);
    return Promise.resolve(record);
  }

  markInstallationDeleted(githubInstallationId: number): Promise<void> {
    this.installations.delete(githubInstallationId);
    return Promise.resolve();
  }

  findInstallation(
    githubInstallationId: number,
  ): Promise<InstallationRecord | null> {
    return Promise.resolve(
      this.installations.get(githubInstallationId) ?? null,
    );
  }

  upsertRepository(input: {
    githubRepoId: number;
    owner: string;
    name: string;
    installationId: string;
  }): Promise<RepositoryRecord> {
    const key = `${input.owner}/${input.name}`;
    const existing = this.repositories.get(key);
    if (existing) return Promise.resolve(existing);

    const record: RepositoryRecord = {
      id: this.id("repo"),
      installationId: input.installationId,
      owner: input.owner,
      name: input.name,
      indexedAt: null,
      indexingStartedAt: null,
    };
    this.repositories.set(key, record);
    return Promise.resolve(record);
  }

  private repositoryById(repositoryId: string): RepositoryRecord | undefined {
    for (const record of this.repositories.values()) {
      if (record.id === repositoryId) return record;
    }
    return undefined;
  }

  markIndexingStarted(repositoryId: string): Promise<void> {
    const record = this.repositoryById(repositoryId);
    if (record) record.indexingStartedAt = new Date();
    return Promise.resolve();
  }

  markIndexed(repositoryId: string): Promise<void> {
    const record = this.repositoryById(repositoryId);
    if (record) record.indexedAt = new Date();
    return Promise.resolve();
  }

  ensureReview(input: {
    repositoryId: string;
    pullRequestNumber: number;
    /** Stored by `PrismaReviewStore`; nothing observable here reads it. */
    title: string;
  }): Promise<ReviewRecord> {
    const key = `${input.repositoryId}#${input.pullRequestNumber}`;
    const existing = this.reviews.get(key);
    if (existing) return Promise.resolve({ ...existing });

    const record: ReviewRecord = {
      id: this.id("review"),
      repositoryId: input.repositoryId,
      pullRequestNumber: input.pullRequestNumber,
      commentId: null,
    };
    this.reviews.set(key, record);
    return Promise.resolve({ ...record });
  }

  private reviewById(reviewId: string): ReviewRecord | undefined {
    for (const record of this.reviews.values()) {
      if (record.id === reviewId) return record;
    }
    return undefined;
  }

  setReviewComment(input: {
    reviewId: string;
    commentId: number;
  }): Promise<void> {
    const record = this.reviewById(input.reviewId);
    if (record) record.commentId = input.commentId;
    return Promise.resolve();
  }

  hasDeclinedRun(reviewId: string): Promise<boolean> {
    return Promise.resolve(
      this.runs.some(
        (run) => run.reviewId === reviewId && run.status === "declined",
      ),
    );
  }

  startRun(input: {
    reviewId: string;
    headSha: string;
    previousAttemptAbandoned: boolean;
    githubDeliveryId: string | null;
  }): Promise<ReviewRunRecord | null> {
    const existing = this.runs.find(
      (run) => run.reviewId === input.reviewId && run.headSha === input.headSha,
    );
    if (existing) {
      // A failed Run is retryable, so is one that only declined, and so is one
      // abandoned by a dead worker — see `PrismaReviewStore.startRun`, which
      // carries the reasoning for all three.
      const mayTakeOver =
        existing.status === "failed" ||
        existing.status === "declined" ||
        (existing.status === "running" &&
          (input.previousAttemptAbandoned ||
            isRunAbandoned(existing.startedAt)));
      if (!mayTakeOver) return Promise.resolve(null);
      existing.status = "running";
      existing.outcomeReason = null;
      existing.costUsd = null;
      existing.startedAt = new Date();
      existing.results = [];
      existing.githubDeliveryId = input.githubDeliveryId;
      return Promise.resolve({ id: existing.id, headSha: existing.headSha });
    }

    const run: StoredRun = {
      id: this.id("run"),
      reviewId: input.reviewId,
      headSha: input.headSha,
      status: "running",
      outcomeReason: null,
      costUsd: null,
      startedAt: new Date(),
      results: [],
      githubDeliveryId: input.githubDeliveryId,
    };
    this.runs.push(run);
    return Promise.resolve({ id: run.id, headSha: run.headSha });
  }

  /**
   * Arrange-only: place a Run left at `running`, as a worker killed mid-review
   * leaves one.
   *
   * This state cannot be produced through the seam. The pipeline's catch block
   * always runs and writes `failed`, so a mid-flight death is exactly the thing
   * the seam cannot stage — which is why it is staged here instead. Seeding is
   * arrange; nothing in the suite asserts on this store.
   */
  seedRunningRun(input: {
    reviewId: string;
    headSha: string;
    startedAt?: Date;
  }): string {
    const run: StoredRun = {
      id: this.id("run"),
      reviewId: input.reviewId,
      headSha: input.headSha,
      status: "running",
      outcomeReason: null,
      costUsd: null,
      startedAt: input.startedAt ?? new Date(),
      results: [],
      githubDeliveryId: null,
    };
    this.runs.push(run);
    return run.id;
  }

  completeRun(input: PersistRunInput): Promise<void> {
    // `CriterionResult` is unique on `(reviewRunId, criterionId)`, and
    // `createMany` violates that against its own payload — no pre-existing
    // rows required. Enforced here because a fake that accepts what Postgres
    // rejects makes the defect unreachable from the suite: the whole Run
    // fails at the persistence step, after the model has been paid for.
    const seen = new Set<string>();
    for (const result of input.results) {
      if (seen.has(result.criterionId)) {
        return Promise.reject(
          new Error(
            `Unique constraint failed on (reviewRunId, criterionId): ${result.criterionId}`,
          ),
        );
      }
      seen.add(result.criterionId);
    }

    const run = this.runs.find((candidate) => candidate.id === input.runId);
    if (run) {
      run.status = "completed";
      run.costUsd = input.costUsd;
      run.results = input.results.map((result) => ({
        criterionKey: result.criterionKey,
        verdict: result.verdict,
      }));
    }
    return Promise.resolve();
  }

  declineRun(input: {
    runId: string;
    outcomeReason: "unlinked" | "no_provider_key";
  }): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === input.runId);
    if (run) {
      run.status = "declined";
      run.outcomeReason = input.outcomeReason;
    }
    return Promise.resolve();
  }

  failRun(input: {
    runId: string;
    outcomeReason: ReviewOutcomeReason;
    costUsd?: number;
  }): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === input.runId);
    if (run) {
      run.status = "failed";
      run.outcomeReason = input.outcomeReason;
      // Undefined means unknown, and stays distinct from a recorded zero.
      run.costUsd = input.costUsd ?? null;
    }
    return Promise.resolve();
  }

  recordProviderAuthFailure(installationId: string): Promise<void> {
    this.providerAuthFailures.add(installationId);
    return Promise.resolve();
  }

  previousResults(input: {
    reviewId: string;
    beforeRunId: string;
  }): Promise<StoredCriterionResult[]> {
    const forReview = this.runs.filter(
      (run) => run.reviewId === input.reviewId,
    );
    const index = forReview.findIndex((run) => run.id === input.beforeRunId);
    if (index <= 0) return Promise.resolve([]);

    // The most recent *completed* Run before this one, so a failed Run in
    // between does not erase the comparison.
    for (let i = index - 1; i >= 0; i--) {
      const candidate = forReview[i]!;
      if (candidate.status === "completed") {
        return Promise.resolve(candidate.results);
      }
    }
    return Promise.resolve([]);
  }

  countRuns(reviewId: string): Promise<number> {
    return Promise.resolve(
      this.runs.filter(
        (run) => run.reviewId === reviewId && run.status === "completed",
      ).length,
    );
  }

  criteriaForIssue(input: {
    repositoryId: string;
    issueNumber: number;
    issueBodyHash: string;
  }): Promise<Criterion[] | null> {
    const entry = this.criteria.get(
      `${input.repositoryId}#${input.issueNumber}`,
    );
    if (!entry || entry.hash !== input.issueBodyHash) {
      return Promise.resolve(null);
    }
    // An empty set is indistinguishable from "never extracted" once it is
    // rows in a table, so `PrismaReviewStore` re-extracts in that case. Match
    // that here, or the suite would be exercising behaviour production
    // does not have.
    if (entry.criteria.length === 0) return Promise.resolve(null);
    return Promise.resolve(entry.criteria);
  }

  recordCriteria(input: {
    repositoryId: string;
    issueNumber: number;
    issueBodyHash: string;
    criteria: Criterion[];
  }): Promise<Criterion[]> {
    const stored = input.criteria.map((criterion) => ({
      ...criterion,
      id: this.id("crit"),
    }));
    this.criteria.set(`${input.repositoryId}#${input.issueNumber}`, {
      hash: input.issueBodyHash,
      criteria: stored,
    });
    return Promise.resolve(stored);
  }
}

/** A Codebase Index that records that it was asked, and returns fixed text. */
export class FakeCodebaseIndex implements CodebaseIndex {
  indexedRepositories: string[] = [];
  context = "";
  /** Set false to stand in for an indexing provider that was unreachable. */
  buildsSuccessfully = true;

  ensureIndexed(input: { repositoryId: string }): Promise<boolean> {
    this.indexedRepositories.push(input.repositoryId);
    return Promise.resolve(this.buildsSuccessfully);
  }

  search(): Promise<string> {
    return Promise.resolve(this.context);
  }
}

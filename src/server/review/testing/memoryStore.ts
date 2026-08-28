import type {
  CodebaseIndex,
  InstallationRecord,
  PersistRunInput,
  RepositoryRecord,
  ReviewRecord,
  ReviewRunRecord,
  ReviewStore,
  StoredCriterionResult,
} from "../ports";
import type { Criterion } from "../types";

interface StoredRun {
  id: string;
  reviewId: string;
  headSha: string;
  status: "running" | "completed" | "failed";
  results: StoredCriterionResult[];
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
  }): Promise<ReviewRecord> {
    const key = `${input.repositoryId}#${input.pullRequestNumber}`;
    const existing = this.reviews.get(key);
    if (existing) return Promise.resolve({ ...existing });

    const record: ReviewRecord = {
      id: this.id("review"),
      repositoryId: input.repositoryId,
      pullRequestNumber: input.pullRequestNumber,
      commentId: null,
      declinedAt: null,
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

  markDeclined(reviewId: string): Promise<void> {
    const record = this.reviewById(reviewId);
    if (record) record.declinedAt = new Date();
    return Promise.resolve();
  }

  startRun(input: {
    reviewId: string;
    headSha: string;
  }): Promise<ReviewRunRecord | null> {
    const existing = this.runs.find(
      (run) => run.reviewId === input.reviewId && run.headSha === input.headSha,
    );
    if (existing) {
      // A failed Run is retryable — see `PrismaReviewStore.startRun`.
      if (existing.status !== "failed") return Promise.resolve(null);
      existing.status = "running";
      existing.results = [];
      return Promise.resolve({ id: existing.id, headSha: existing.headSha });
    }

    const run: StoredRun = {
      id: this.id("run"),
      reviewId: input.reviewId,
      headSha: input.headSha,
      status: "running",
      results: [],
    };
    this.runs.push(run);
    return Promise.resolve({ id: run.id, headSha: run.headSha });
  }

  completeRun(input: PersistRunInput): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === input.runId);
    if (run) {
      run.status = "completed";
      run.results = input.results.map((result) => ({
        criterionKey: result.criterionKey,
        verdict: result.verdict,
      }));
    }
    return Promise.resolve();
  }

  failRun(runId: string): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === runId);
    if (run) run.status = "failed";
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

  ensureIndexed(input: { repositoryId: string }): Promise<void> {
    this.indexedRepositories.push(input.repositoryId);
    return Promise.resolve();
  }

  search(): Promise<string> {
    return Promise.resolve(this.context);
  }
}

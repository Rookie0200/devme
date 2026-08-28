/**
 * The four ports the review pipeline talks through.
 *
 * Each exists so the pipeline can be driven end-to-end from the webhook seam
 * with nothing real behind it. Production implementations live beside each
 * interface; the fakes used by the test suite live in `./testing`.
 */

import type { Criterion, Verdict } from "./types";

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export interface IssueRef {
  number: number;
  title: string;
  body: string;
}

export interface CheckRunInput {
  owner: string;
  repo: string;
  headSha: string;
  title: string;
  summary: string;
  /**
   * Neutral only at MVP. A wrong verdict must not be able to stop a team from
   * merging, so this is never `failure` and never blocking.
   */
  conclusion: "neutral";
}

/**
 * Everything the pipeline needs from GitHub, scoped to a single Installation.
 * Constructed per Installation from a freshly minted installation token —
 * there is no module-level singleton.
 */
export interface GitHubClient {
  /** `null` when the issue does not exist or is not visible to this Installation. */
  getIssue(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<IssueRef | null>;

  /** The unified diff for the pull request at its current head. */
  getPullRequestDiff(input: {
    owner: string;
    repo: string;
    number: number;
  }): Promise<string>;

  /** File contents at a ref, or `null` when the path does not exist there. */
  getFileAtRef(input: {
    owner: string;
    repo: string;
    path: string;
    ref: string;
  }): Promise<string | null>;

  createComment(input: {
    owner: string;
    repo: string;
    number: number;
    body: string;
  }): Promise<{ id: number }>;

  updateComment(input: {
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }): Promise<void>;

  /** Always neutral at MVP. Never failing, never blocking. */
  createCheckRun(input: CheckRunInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Model provider
// ---------------------------------------------------------------------------

export interface ModelCompletion {
  text: string;
  model: string;
  costUsd: number;
}

/**
 * A single text completion. Tests script this with fixed responses, so no test
 * depends on a model's judgement — only on what the pipeline does with it.
 */
export interface ModelProvider {
  complete(input: {
    system: string;
    prompt: string;
    /** Discriminates scripted responses in tests; ignored in production. */
    purpose: "extract-criteria" | "produce";
  }): Promise<ModelCompletion>;
}

/**
 * Resolves the Provider Key for an Installation and returns a provider bound
 * to it. `null` means no valid key is configured, which is a reportable state
 * rather than an error.
 */
export interface ModelProviderFactory {
  forInstallation(installationId: string): Promise<ModelProvider | null>;
}

// ---------------------------------------------------------------------------
// Codebase Index
// ---------------------------------------------------------------------------

/**
 * The semantic representation of a Repository's source, supplying context a
 * diff alone does not contain.
 *
 * Indexing is paid for by the platform and keeps using the existing cheap
 * summarisation and embedding pipeline — only Producers and the Verifier
 * consume the Installation's Provider Key.
 */
export interface CodebaseIndex {
  /**
   * Builds the index if it does not exist. Lazy: called on first review.
   *
   * Resolves to whether the Repository now has a usable index. The embedding
   * pipeline tolerates a per-file failure by design, so an outage at the
   * provider yields an empty index rather than an exception — returning the
   * outcome is what stops the caller recording that as success and never
   * retrying.
   */
  ensureIndexed(input: {
    repositoryId: string;
    owner: string;
    repo: string;
  }): Promise<boolean>;

  /** Excerpts relevant to a query, rendered for inclusion in a prompt. */
  search(input: { repositoryId: string; query: string }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface ReviewJob {
  installationGithubId: number;
  repositoryGithubId: number;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  headSha: string;
  pullRequestBody: string;
}

/**
 * Narrow on purpose. The BullMQ implementation is used in production; the
 * inline one runs the job synchronously on enqueue and is what makes the
 * single webhook-level test seam viable.
 */
export interface ReviewQueue {
  /**
   * Keyed on the pull request at a head commit, so a redelivered webhook is
   * discarded rather than producing a second Review Run.
   */
  enqueue(job: ReviewJob): Promise<void>;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface InstallationRecord {
  id: string;
  githubInstallationId: number;
  accountLogin: string;
}

export interface RepositoryRecord {
  id: string;
  installationId: string;
  owner: string;
  name: string;
  indexedAt: Date | null;
  indexingStartedAt: Date | null;
}

export interface ReviewRecord {
  id: string;
  repositoryId: string;
  pullRequestNumber: number;
  commentId: number | null;
  declinedAt: Date | null;
}

export interface StoredCriterionResult {
  criterionKey: string;
  verdict: Verdict;
}

export interface ReviewRunRecord {
  id: string;
  headSha: string;
}

export interface PersistRunInput {
  runId: string;
  model: string;
  costUsd: number;
  results: Array<{
    /** Database id, resolved by the caller against the criteria it reviewed. */
    criterionId: string;
    criterionKey: string;
    verdict: Verdict;
    evidence: string;
    evidenceFile: string | null;
    evidenceStartLine: number | null;
    evidenceEndLine: number | null;
  }>;
  findings: Array<{
    producer: string;
    body: string;
    evidenceFile: string | null;
    evidenceStartLine: number | null;
    evidenceEndLine: number | null;
  }>;
}

/**
 * The pipeline's view of persistence.
 *
 * This is a port rather than direct Prisma access so that the seam test suite
 * runs without a live Postgres. The trade-off is that `PrismaReviewStore` is
 * not covered by the suite; it is deliberately kept thin enough to read.
 */
export interface ReviewStore {
  upsertInstallation(input: {
    githubInstallationId: number;
    accountLogin: string;
    accountType: string;
  }): Promise<InstallationRecord>;

  markInstallationDeleted(githubInstallationId: number): Promise<void>;

  findInstallation(
    githubInstallationId: number,
  ): Promise<InstallationRecord | null>;

  upsertRepository(input: {
    githubRepoId: number;
    owner: string;
    name: string;
    installationId: string;
  }): Promise<RepositoryRecord>;

  markIndexingStarted(repositoryId: string): Promise<void>;
  markIndexed(repositoryId: string): Promise<void>;

  /** Creates the Review on first sight of the pull request. */
  ensureReview(input: {
    repositoryId: string;
    pullRequestNumber: number;
  }): Promise<ReviewRecord>;

  setReviewComment(input: {
    reviewId: string;
    commentId: number;
  }): Promise<void>;

  markDeclined(reviewId: string): Promise<void>;

  /**
   * `null` when a Run for this head commit already exists — the duplicate
   * delivery guard.
   */
  startRun(input: {
    reviewId: string;
    headSha: string;
  }): Promise<ReviewRunRecord | null>;

  completeRun(input: PersistRunInput): Promise<void>;
  failRun(runId: string): Promise<void>;

  /** Results of the Run before `beforeRunId`, for the since-last-push diff. */
  previousResults(input: {
    reviewId: string;
    beforeRunId: string;
  }): Promise<StoredCriterionResult[]>;

  /** How many Runs this Review has completed, for the footer. */
  countRuns(reviewId: string): Promise<number>;

  /**
   * Criteria already extracted for this issue at this body hash, or `null` if
   * the issue has not been extracted or its body has changed since.
   */
  criteriaForIssue(input: {
    repositoryId: string;
    issueNumber: number;
    issueBodyHash: string;
  }): Promise<Criterion[] | null>;

  /**
   * Stores a new generation of criteria for this Issue at this body hash.
   *
   * Earlier generations are *retained*, not deleted: Criterion Results point
   * at the criterion they judged, and deleting the row would cascade away the
   * history that the since-last-push comparison is built from.
   */
  recordCriteria(input: {
    repositoryId: string;
    issueNumber: number;
    issueTitle: string;
    issueBodyHash: string;
    criteria: Criterion[];
  }): Promise<Criterion[]>;
}

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

  /**
   * How a failure raised while spending this Installation's Provider Key
   * should be recorded on the Review Run.
   *
   * Asked of the provider because only it knows its own error shapes. The
   * orchestrator must not import a vendor's error types — that is the coupling
   * this port exists to prevent, and it would rot the moment a second provider
   * is supported. A failure the provider does not recognise as its own is
   * `internal`, which is always true.
   */
  classifyFailure(error: unknown): ReviewOutcomeReason;
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
  pullRequestTitle: string;
  headSha: string;
  pullRequestBody: string;
  /**
   * The `X-GitHub-Delivery` id of the webhook delivery that produced this
   * job. Null only for a delivery that genuinely lacked the header — real
   * GitHub deliveries always carry one. Stored against the Run so a manual
   * retry from the dashboard can ask GitHub to redeliver the same event
   * rather than fabricating a job from possibly-stale dashboard state.
   */
  githubDeliveryId: string | null;
}

/**
 * What the queue knows about *this delivery* of a job, as distinct from what
 * the job itself says.
 *
 * Deliberately not a field on `ReviewJob`. The payload is constructed by the
 * webhook handler, which knows nothing about retries, so an optional field
 * there would be absent on exactly the path that needs it — and absent reads
 * as `false`.
 */
export interface ReviewDelivery {
  /**
   * A previous attempt at this job was handed out and did not finish.
   *
   * Set from the queue's own re-delivery accounting and never inferred by the
   * pipeline, for the same reason failure classification belongs to the
   * `ModelProvider`: the orchestrator must not learn one vendor's semantics.
   * What the pipeline gets is the conclusion, not the counter.
   */
  previousAttemptAbandoned: boolean;
}

/** What a queue hands to the pipeline for each delivery. */
export type ReviewJobHandler = (
  job: ReviewJob,
  delivery: ReviewDelivery,
) => Promise<void>;

/**
 * Narrow on purpose. The BullMQ implementation is used in production; the
 * inline one runs the job synchronously on enqueue and is what makes the
 * single webhook-level test seam viable.
 */
export interface ReviewQueue {
  /**
   * Accepts every delivery. De-duplication is **not** done here — a queue key
   * cannot tell a redelivery from a genuine second attempt at the same commit,
   * and claiming the commit made a declined pull request unreviewable. The
   * guard lives in `ReviewStore.startRun`.
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
}

/**
 * Why a Review Run ended as it did.
 *
 * Stored as a `String` rather than a Postgres enum and narrowed here: this set
 * is expected to grow, and each new value would otherwise be a migration
 * against a production database. Nothing writes it but the pipeline.
 *
 * `internal` is the honest default. A Verifier bug, a GitHub timeout, and a
 * genuine provider outage all arrive at the same catch, so anything more
 * specific is a claim about the world that usually cannot be supported —
 * and `provider_auth` in particular accuses the customer's credential.
 */
export type ReviewOutcomeReason =
  | "unlinked"
  | "no_provider_key"
  | "provider_auth"
  | "provider_unavailable"
  | "github_error"
  | "internal";

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

  /**
   * Creates the Review on first sight of the pull request, and refreshes the
   * title on every delivery so a renamed pull request reads correctly.
   */
  ensureReview(input: {
    repositoryId: string;
    pullRequestNumber: number;
    title: string;
  }): Promise<ReviewRecord>;

  setReviewComment(input: {
    reviewId: string;
    commentId: number;
  }): Promise<void>;

  /**
   * Whether this Review has ever been declined, which is what stops a
   * long-running Unlinked branch being nagged on every push.
   *
   * Deliberately per-Review, not per-commit. **Must be read before
   * `startRun`**: starting a Run supersedes a declined row for that commit,
   * so asking afterwards can report `false` for a Review that has plainly
   * been declined, and the declining comment would be re-rendered.
   */
  hasDeclinedRun(reviewId: string): Promise<boolean>;

  /**
   * `null` when this head commit has already been evaluated — the duplicate
   * delivery guard, and what stops a redelivery charging a Provider Key
   * twice.
   *
   * A Run that only *declined* does not block: it was never an evaluation.
   * That is what lets a pull request declined as Unlinked be reviewed once
   * its Issue link is added, which fires at the same head commit because
   * editing a body is not a subscribed action.
   *
   * Nor does a Run whose worker died holding it. Such a Run is left at
   * `running` with nothing to move it, so blocking on it would make the
   * commit permanently unreviewable — see the implementation for the two
   * signals that establish abandonment.
   *
   * This is the *only* gate on starting a Run. There is deliberately no
   * separate `abandonRun`: a second writer of Run status opens a window
   * between the two calls for a concurrent delivery to interleave, which is
   * precisely the race the unique constraint on `(reviewId, headSha)` exists
   * to settle.
   */
  startRun(input: {
    reviewId: string;
    headSha: string;
    /** From `ReviewDelivery`, not from the job payload. */
    previousAttemptAbandoned: boolean;
    /** From the job. Refreshed on takeover, so a retry always targets the delivery that most recently owns this Run. */
    githubDeliveryId: string | null;
  }): Promise<ReviewRunRecord | null>;

  completeRun(input: PersistRunInput): Promise<void>;

  /** Ends a Run that concluded without evaluating anything. */
  declineRun(input: {
    runId: string;
    outcomeReason: Extract<
      ReviewOutcomeReason,
      "unlinked" | "no_provider_key"
    >;
  }): Promise<void>;

  /**
   * Ends a Run that tried and broke.
   *
   * `costUsd` records spend already incurred — the Producer bills before the
   * Verifier can throw. Omitted means *unknown*, which is deliberately not
   * the same as `0`.
   */
  failRun(input: {
    runId: string;
    outcomeReason: ReviewOutcomeReason;
    costUsd?: number;
  }): Promise<void>;

  /**
   * Records that a real Review Run was refused by the provider on this
   * Installation's Provider Key, so the dashboard can say so without
   * re-deriving it. Never called for a provider that was merely unreachable.
   */
  recordProviderAuthFailure(installationId: string): Promise<void>;

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

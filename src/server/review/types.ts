/**
 * Domain types for spec-adherence review.
 *
 * Vocabulary here is the vocabulary in `CONTEXT.md`. A Producer emits
 * Proposals; the Verifier turns surviving Proposals into Criterion Results and
 * Findings. Nothing in this file talks to GitHub, a model, or the database.
 */

/** The verdict a Review Run reaches on one Acceptance Criterion. */
export type Verdict = "satisfied" | "unsatisfied" | "unclear";

/**
 * A stable identity for an Acceptance Criterion that survives re-extraction.
 * Producers refer to criteria by this rather than by database id, so a prompt
 * never carries a uuid.
 */
export function criterionKey(issueNumber: number, ordinal: number): string {
  return `${issueNumber}:${ordinal}`;
}

/** An Acceptance Criterion as the pipeline carries it, before persistence. */
export interface Criterion {
  /** Database id. Absent until the criterion has been persisted. */
  id?: string;
  issueNumber: number;
  issueTitle: string;
  ordinal: number;
  text: string;
}

/**
 * Evidence that points at a specific place. `quote` is what the Producer
 * claims that range says; the Verifier reads the range itself and discards the
 * proposal if the quote is not there.
 */
export interface EvidenceCitation {
  file: string;
  startLine: number;
  endLine: number;
  quote: string;
}

/**
 * Evidence that something is *not* there. Spec-adherence verdicts are
 * frequently claims about absence, which have no line to cite, so the Verifier
 * checks them by searching the diff and the Codebase Index for `missing` and
 * discarding the proposal if it turns up.
 */
export interface AbsenceClaim {
  /** An identifier or literal the Producer claims appears nowhere. */
  missing: string;
  /** The sentence rendered as this item's Evidence. */
  statement: string;
}

export type ProposedEvidence =
  | { kind: "citation"; citation: EvidenceCitation }
  | { kind: "absence"; absence: AbsenceClaim };

/** A Producer's proposed verdict on one Acceptance Criterion. */
export interface CriterionProposal {
  kind: "criterion";
  criterionKey: string;
  verdict: Verdict;
  evidence: ProposedEvidence;
}

/** A Producer's proposed observation not tied to an Acceptance Criterion. */
export interface FindingProposal {
  kind: "finding";
  producer: string;
  body: string;
  evidence: ProposedEvidence;
}

export type Proposal = CriterionProposal | FindingProposal;

/** A Criterion Result that has passed the Verifier. */
export interface VerifiedCriterionResult {
  criterionKey: string;
  verdict: Verdict;
  evidence: string;
  evidenceFile: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
}

/** A Finding that has passed the Verifier. */
export interface VerifiedFinding {
  producer: string;
  body: string;
  evidenceFile: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
}

export interface VerifiedOutput {
  results: VerifiedCriterionResult[];
  findings: VerifiedFinding[];
}

/** The pull request under review, as the pipeline sees it. */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  body: string;
}

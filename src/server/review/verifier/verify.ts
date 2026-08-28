import type {
  Proposal,
  ProposedEvidence,
  VerifiedCriterionResult,
  VerifiedFinding,
  VerifiedOutput,
  Verdict,
} from "../types";
import { isStylistic } from "./stylistic";

/** The hard cap. Forces ranking rather than exhaustive listing. */
export const MAX_REPORTED_ITEMS = 10;

/**
 * Fetches a file's contents so a citation can be checked, or `null` if the
 * path does not exist at the reviewed ref. Results should be cached by the
 * caller — the Verifier will ask for the same file repeatedly.
 */
export type LocateFile = (path: string) => Promise<string | null>;

export interface VerifyInput {
  proposals: Proposal[];
  locate: LocateFile;
  /** The diff under review, searched when checking an absence claim. */
  diff: string;
  /** Codebase Index excerpts, also searched when checking an absence claim. */
  codebaseContext: string;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Whether the cited range genuinely says what the Producer claimed.
 *
 * Whitespace is normalised because a model reproducing a quote will not match
 * the file's indentation, but the words themselves must be there.
 */
function quoteAppearsInRange(
  contents: string,
  startLine: number,
  endLine: number,
  quote: string,
): boolean {
  const lines = contents.split("\n");
  const from = Math.max(1, startLine);
  const to = Math.min(lines.length, Math.max(from, endLine));
  if (from > lines.length) return false;

  const range = normalise(lines.slice(from - 1, to).join("\n"));
  const needle = normalise(quote);
  return needle.length > 0 && range.includes(needle);
}

/**
 * Grounding is asymmetric by design: a false "unsatisfied" costs more trust
 * than a missed one, so accusations are checked hard and `satisfied` verdicts
 * pass cheaply.
 *
 * @param strict `true` for `unsatisfied`, `unclear`, and every Finding.
 */
async function isGrounded(
  evidence: ProposedEvidence,
  strict: boolean,
  input: VerifyInput,
): Promise<boolean> {
  if (evidence.kind === "citation") {
    const { file, startLine, endLine, quote } = evidence.citation;
    const contents = await input.locate(file);
    // A cited file that does not exist fails even the cheap path — there is
    // nothing to point the developer at.
    if (contents === null) return false;
    if (!strict) return true;
    return quoteAppearsInRange(contents, startLine, endLine, quote);
  }

  if (!strict) return true;

  // An absence claim is refuted if the thing claimed missing is right there.
  const haystack = normalise(`${input.diff}\n${input.codebaseContext}`);
  const needle = normalise(evidence.absence.missing);
  if (needle.length === 0) return false;
  return !haystack.includes(needle);
}

function evidenceText(evidence: ProposedEvidence): string {
  return evidence.kind === "citation"
    ? evidence.citation.quote
    : evidence.absence.statement;
}

/**
 * Only what the Producer *wrote*, never source it quoted.
 *
 * A citation's quote is code copied out of the repository, so running the
 * stylistic classifier over it silently drops correct verdicts whenever the
 * cited lines happen to contain a word like `name` or `format` — which is
 * most of the time. An absence claim's `statement` is prose the Producer
 * composed, so that one does count.
 */
function producerProse(proposal: Proposal): string {
  const evidence =
    proposal.evidence.kind === "absence"
      ? proposal.evidence.absence.statement
      : "";
  return proposal.kind === "finding"
    ? `${proposal.body} ${evidence}`
    : evidence;
}

function evidenceLocation(evidence: ProposedEvidence) {
  return evidence.kind === "citation"
    ? {
        evidenceFile: evidence.citation.file,
        evidenceStartLine: evidence.citation.startLine,
        evidenceEndLine: evidence.citation.endLine,
      }
    : { evidenceFile: null, evidenceStartLine: null, evidenceEndLine: null };
}

/** Most informative first, so that the cap drops the least useful items. */
const PRIORITY: Record<Verdict | "finding", number> = {
  unsatisfied: 0,
  unclear: 1,
  finding: 2,
  satisfied: 3,
};

/**
 * The only path to a pull request.
 *
 * Every proposal is either grounded in Evidence the Verifier could
 * independently locate, or discarded. Nothing self-reported by a Producer —
 * confidence, severity, its own claim to be non-stylistic — is trusted.
 */
export async function verify(input: VerifyInput): Promise<VerifiedOutput> {
  const survivors: Array<{
    priority: number;
    order: number;
    proposal: Proposal;
  }> = [];

  for (const [order, proposal] of input.proposals.entries()) {
    if (isStylistic(producerProse(proposal))) continue;

    const strict =
      proposal.kind === "finding" || proposal.verdict !== "satisfied";

    if (!(await isGrounded(proposal.evidence, strict, input))) continue;

    survivors.push({
      priority:
        proposal.kind === "finding"
          ? PRIORITY.finding
          : PRIORITY[proposal.verdict],
      order,
      proposal,
    });
  }

  const kept = survivors
    .sort((a, b) => a.priority - b.priority || a.order - b.order)
    .slice(0, MAX_REPORTED_ITEMS)
    // Rank to select, but report in the order the Producer raised them, so the
    // criteria table still reads in issue order.
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.proposal);

  const results: VerifiedCriterionResult[] = [];
  const findings: VerifiedFinding[] = [];

  for (const proposal of kept) {
    if (proposal.kind === "finding") {
      findings.push({
        producer: proposal.producer,
        body: proposal.body,
        ...evidenceLocation(proposal.evidence),
      });
    } else {
      results.push({
        criterionKey: proposal.criterionKey,
        verdict: proposal.verdict,
        evidence: evidenceText(proposal.evidence),
        ...evidenceLocation(proposal.evidence),
      });
    }
  }

  return { results, findings };
}

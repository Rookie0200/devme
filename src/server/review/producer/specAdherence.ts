import type { ModelProvider } from "../ports";
import type { Criterion, Proposal, Verdict } from "../types";
import { criterionKey } from "../types";
import { parseJsonArrayFromModel } from "../model/parse";
import type { ModelCompletion } from "../ports";

export const SPEC_ADHERENCE_PRODUCER = "spec-adherence";

const SYSTEM = `You judge whether a pull request delivers what its issue asked for.

You will be given acceptance criteria, the pull request diff, and excerpts of
the surrounding codebase. For each criterion, decide:

  "satisfied"   — the diff plainly does this.
  "unsatisfied" — the diff plainly does not do this.
  "unclear"     — you cannot tell from what you were given.

Every judgement must carry evidence, in one of exactly two forms:

  A citation:      {"file": "...", "startLine": n, "endLine": n, "quote": "..."}
                   The quote must be text that literally appears in that file at
                   that range. It will be checked. If you cannot quote it
                   exactly, do not cite it.

  An absence claim: {"missing": "...", "statement": "..."}
                   "missing" is a single identifier or literal that you claim
                   appears nowhere in the diff or the codebase. It will be
                   searched for. "statement" is the sentence shown to the
                   developer.

You may also report observations not tied to any criterion, as
{"kind": "finding", ...}. Report these only for correctness, security, or data
integrity. Never report formatting, naming, style, or preference. Never
speculate about code you were not shown.

Respond with a JSON array of objects and nothing else. Each object is:

  {"kind": "criterion", "criterion": "<key>", "verdict": "...", "evidence": {...}}
  {"kind": "finding", "body": "...", "evidence": {...}}`;

const VERDICTS: readonly Verdict[] = ["satisfied", "unsatisfied", "unclear"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Structural parse only. Whether the evidence is *true* is the Verifier's job. */
function parseEvidence(raw: unknown): Proposal["evidence"] | null {
  if (!isRecord(raw)) return null;

  if (typeof raw.file === "string" && typeof raw.quote === "string") {
    const startLine = Number(raw.startLine);
    const endLine = Number(raw.endLine);
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return null;
    return {
      kind: "citation",
      citation: {
        file: raw.file,
        startLine: Math.trunc(startLine),
        endLine: Math.trunc(endLine),
        quote: raw.quote,
      },
    };
  }

  if (typeof raw.missing === "string" && typeof raw.statement === "string") {
    return {
      kind: "absence",
      absence: { missing: raw.missing, statement: raw.statement },
    };
  }

  return null;
}

function parseProposals(text: string, validKeys: Set<string>): Proposal[] {
  const proposals: Proposal[] = [];

  for (const entry of parseJsonArrayFromModel(text)) {
    if (!isRecord(entry)) continue;

    const evidence = parseEvidence(entry.evidence);
    if (!evidence) continue;

    if (entry.kind === "finding") {
      if (typeof entry.body !== "string" || entry.body.trim() === "") continue;
      proposals.push({
        kind: "finding",
        producer: SPEC_ADHERENCE_PRODUCER,
        body: entry.body.trim(),
        evidence,
      });
      continue;
    }

    // A verdict on a criterion we did not ask about is discarded rather than
    // rendered against a criterion the developer never saw.
    const key = entry.criterion;
    if (typeof key !== "string" || !validKeys.has(key)) continue;

    const verdict = entry.verdict;
    if (typeof verdict !== "string") continue;
    if (!VERDICTS.includes(verdict as Verdict)) continue;

    proposals.push({
      kind: "criterion",
      criterionKey: key,
      verdict: verdict as Verdict,
      evidence,
    });
  }

  return proposals;
}

export interface ProducerResult {
  proposals: Proposal[];
  completion: ModelCompletion;
}

/**
 * The single Producer at MVP. It proposes; it never publishes. Everything it
 * returns still has to survive the Verifier.
 */
export async function produceSpecAdherence(input: {
  model: ModelProvider;
  criteria: Criterion[];
  diff: string;
  /** Excerpts from the Codebase Index, for conventions a diff cannot show. */
  codebaseContext: string;
}): Promise<ProducerResult> {
  const { model, criteria, diff, codebaseContext } = input;

  const criteriaBlock = criteria
    .map(
      (c) =>
        `${criterionKey(c.issueNumber, c.ordinal)} (issue #${c.issueNumber}): ${c.text}`,
    )
    .join("\n");

  const completion = await model.complete({
    system: SYSTEM,
    purpose: "produce",
    prompt: [
      "## Acceptance criteria",
      criteriaBlock,
      "",
      "## Diff",
      diff,
      "",
      "## Surrounding codebase",
      codebaseContext || "(no index available)",
    ].join("\n"),
  });

  const validKeys = new Set(
    criteria.map((c) => criterionKey(c.issueNumber, c.ordinal)),
  );

  return { proposals: parseProposals(completion.text, validKeys), completion };
}

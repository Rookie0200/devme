import type { Criterion, VerifiedFinding, Verdict } from "../types";
import { criterionKey } from "../types";

/**
 * Rendering the Review comment.
 *
 * The shape is fixed and deliberately spare: no preamble, no praise, no
 * restatement of the diff. Everything here is a comment the application owns
 * and revises in place, never a second comment appended to the thread.
 */

const SYMBOL: Record<Verdict, string> = {
  satisfied: "✅",
  unsatisfied: "⚠️",
  unclear: "❔",
};

export interface RenderedResult {
  criterionKey: string;
  verdict: Verdict;
  evidence: string;
  evidenceFile: string | null;
  evidenceStartLine: number | null;
}

export interface RenderCommentInput {
  criteria: Criterion[];
  results: RenderedResult[];
  findings: VerifiedFinding[];
  /** Verdicts from the previous Review Run, keyed by criterion key. */
  previousVerdicts: Map<string, Verdict>;
  runCount: number;
  headSha: string;
}

/**
 * Acceptance Criteria this Run reached no verdict on.
 *
 * A criterion arrives here because the Producer never proposed on it, or
 * because the Verifier could not ground the proposal it made. Both mean the
 * same thing to a reader — part of the spec went unjudged — so they are not
 * distinguished. Shared with the Check Run summary so the two surfaces cannot
 * report different numbers.
 */
export function unreportedCriteria(
  criteria: Criterion[],
  results: Array<{ criterionKey: string }>,
): Criterion[] {
  const reported = new Set(results.map((result) => result.criterionKey));
  return criteria.filter(
    (criterion) =>
      !reported.has(criterionKey(criterion.issueNumber, criterion.ordinal)),
  );
}

/** A literal pipe would break out of the table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function evidenceCell(result: RenderedResult): string {
  if (result.evidenceFile && result.evidenceStartLine !== null) {
    return `\`${result.evidenceFile}:${result.evidenceStartLine}\``;
  }
  return cell(result.evidence);
}

/**
 * The annotation that makes the comment read as a collaborator tracking
 * progress rather than a bot repeating itself. Derived by comparing against
 * the previous Run, which is why results are persisted per Run.
 */
function changeAnnotation(
  result: RenderedResult,
  previousVerdicts: Map<string, Verdict>,
): string {
  const previous = previousVerdicts.get(result.criterionKey);
  if (previous === undefined || previous === result.verdict) return "";
  return result.verdict === "satisfied"
    ? " — *satisfied since last push*"
    : " — *changed since last push*";
}

export function renderReviewComment(input: RenderCommentInput): string {
  const { criteria, results, findings, previousVerdicts, runCount, headSha } =
    input;

  const byKey = new Map(results.map((r) => [r.criterionKey, r]));
  const sections: string[] = [];

  // Criteria from several Issues are grouped by Issue, so a pull request
  // closing two tickets reads as two specifications rather than one list.
  const issueNumbers = [...new Set(criteria.map((c) => c.issueNumber))];

  for (const issueNumber of issueNumbers) {
    const forIssue = criteria.filter((c) => c.issueNumber === issueNumber);
    const rows = forIssue
      .map((criterion) => {
        const result = byKey.get(
          criterionKey(criterion.issueNumber, criterion.ordinal),
        );
        // A criterion the Verifier dropped or the cap truncated is omitted
        // rather than shown with an invented verdict.
        if (!result) return null;
        return `| ${SYMBOL[result.verdict]} | ${cell(criterion.text)} | ${evidenceCell(result)}${changeAnnotation(result, previousVerdicts)} |`;
      })
      .filter((row): row is string => row !== null);

    if (rows.length === 0) continue;

    const title = forIssue[0]?.issueTitle ?? "";
    sections.push(
      [
        `**Reviewing against #${issueNumber}** — ${title}`,
        "",
        "| | Acceptance criterion | |",
        "|---|---|---|",
        ...rows,
      ].join("\n"),
    );
  }

  if (sections.length === 0) {
    sections.push(
      "**No acceptance criteria could be grounded in this diff.** Nothing is reported rather than guessing.",
    );
  } else {
    // A report that omitted part of the spec says so. Silence is what made
    // this dangerous: the comment renders what it was handed and looks
    // complete either way. Suppressed above, where the fallback already says
    // it at greater length.
    const missing = unreportedCriteria(criteria, results).length;
    if (missing > 0) {
      sections.push(
        missing === 1
          ? "*1 acceptance criterion could not be judged from this diff and is not listed.*"
          : `*${missing} acceptance criteria could not be judged from this diff and are not listed.*`,
      );
    }
  }

  if (findings.length > 0) {
    const lines = findings.map((finding) => {
      const where =
        finding.evidenceFile && finding.evidenceStartLine !== null
          ? ` \`${finding.evidenceFile}:${finding.evidenceStartLine}\``
          : "";
      return `- ${finding.body}${where}`;
    });
    sections.push(["**Also noticed**", ...lines].join("\n"));
  }

  const times = runCount === 1 ? "once" : `${runCount} times`;
  sections.push(
    `<sub>Reviewed ${times} · last at \`${headSha.slice(0, 7)}\`</sub>`,
  );

  return sections.join("\n\n");
}

/**
 * An Unlinked pull request is declined, not reviewed against its own
 * description — see docs/adr/0003. Posted once per pull request.
 */
export function renderDeclinedComment(): string {
  return [
    "**No review performed** — this pull request does not link an issue.",
    "",
    "This reviewer judges a pull request against the acceptance criteria in the issue it closes, so with no issue linked there is nothing to judge it against.",
    "",
    "Add a closing keyword to the description — `Closes #123` — and push again.",
  ].join("\n");
}

/** A missing Provider Key surfaces as an actionable message, not silence. */
export function renderMissingProviderKeyComment(): string {
  return [
    "**No review performed** — this installation has no model provider key configured.",
    "",
    "Reviews run on your own provider key so that you pay your own rate for inference. Add one in the dashboard and push again.",
  ].join("\n");
}

/**
 * Posted immediately on an unindexed Repository, then revised in place once
 * the Review Run completes, so that silence is not mistaken for failure.
 */
export function renderIndexingComment(): string {
  return [
    "**Indexing this repository** — first review, so this one will take a few minutes.",
    "",
    "This comment will be replaced with the review when indexing finishes.",
  ].join("\n");
}

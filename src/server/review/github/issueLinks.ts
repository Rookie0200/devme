/**
 * Resolving which Issue a pull request claims to close.
 *
 * A pull request that resolves to nothing is Unlinked and is declined rather
 * than reviewed against its own description — see docs/adr/0003.
 */

/** GitHub's closing keywords, verbatim. */
const CLOSING_KEYWORDS = [
  "close",
  "closes",
  "closed",
  "fix",
  "fixes",
  "fixed",
  "resolve",
  "resolves",
  "resolved",
];

const LINK_PATTERN = new RegExp(
  String.raw`\b(?:${CLOSING_KEYWORDS.join("|")})\b\s*:?\s+` +
    String.raw`(?:#(\d+)|https?://github\.com/([\w.-]+)/([\w.-]+)/issues/(\d+))`,
  "gi",
);

export interface LinkedIssue {
  number: number;
  /** Set only when the link was a cross-repository URL. */
  owner?: string;
  repo?: string;
}

/**
 * Strip fenced and inline code so that a closing keyword inside a code sample
 * does not link an issue. GitHub applies the same exclusion.
 */
function stripCode(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

/**
 * Every Issue the pull request body links via a closing keyword, in the order
 * they appear and without duplicates. A pull request may link more than one;
 * the review is judged against all of them.
 */
export function resolveLinkedIssues(body: string): LinkedIssue[] {
  const seen = new Set<string>();
  const found: LinkedIssue[] = [];

  for (const match of stripCode(body ?? "").matchAll(LINK_PATTERN)) {
    const [, shortNumber, urlOwner, urlRepo, urlNumber] = match;

    const raw = shortNumber ?? urlNumber;
    if (!raw) continue;

    const number = Number.parseInt(raw, 10);
    if (!Number.isSafeInteger(number) || number <= 0) continue;

    const key = urlOwner ? `${urlOwner}/${urlRepo}#${number}` : `#${number}`;
    if (seen.has(key)) continue;
    seen.add(key);

    found.push(
      urlOwner && urlRepo ? { number, owner: urlOwner, repo: urlRepo } : { number },
    );
  }

  return found;
}

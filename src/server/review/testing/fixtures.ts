import type { Verdict } from "../types";

/** The file every citation in the suite points into. Line numbers matter. */
export const RATE_LIMIT_PATH = "src/middleware/rateLimit.ts";

export const RATE_LIMIT_FILE = [
  /*  1 */ 'import { NextResponse } from "next/server";',
  /*  2 */ "",
  /*  3 */ "const LIMIT = 100;",
  /*  4 */ "",
  /*  5 */ "export function rateLimit(req: Request) {",
  /*  6 */ "  if (count(req) > LIMIT) {",
  /*  7 */
  '    return new NextResponse(null, { status: 429, headers: { "Retry-After": "60" } });',
  /*  8 */ "  }",
  /*  9 */ "  return null;",
  /* 10 */ "}",
].join("\n");

export const DIFF = [
  `diff --git a/${RATE_LIMIT_PATH} b/${RATE_LIMIT_PATH}`,
  "new file mode 100644",
  "--- /dev/null",
  `+++ b/${RATE_LIMIT_PATH}`,
  "@@ -0,0 +1,10 @@",
  ...RATE_LIMIT_FILE.split("\n").map((line) => `+${line}`),
].join("\n");

export const ISSUE_142_BODY = [
  "The public API has no rate limiting.",
  "",
  "- Requests must be limited to 100/min per API key.",
  "- Exceeding the limit must return 429 with a Retry-After header.",
].join("\n");

export const ISSUE_143_BODY = [
  "Rate limit responses should be observable.",
  "",
  "- Emit a metric when a request is rejected.",
].join("\n");

/** A model response for `extract-criteria`. */
export function extractScript(criteria: string[]): string {
  return JSON.stringify(criteria);
}

/** A citation into `RATE_LIMIT_FILE` that the Verifier will be able to locate. */
export function citation(startLine: number, endLine: number, quote: string) {
  return { file: RATE_LIMIT_PATH, startLine, endLine, quote };
}

export const GOOD_CITATION = citation(3, 3, "const LIMIT = 100");
export const RETRY_AFTER_CITATION = citation(7, 7, "status: 429");

export function criterionProposal(
  key: string,
  verdict: Verdict,
  evidence: unknown,
) {
  return { kind: "criterion", criterion: key, verdict, evidence };
}

export function findingProposal(body: string, evidence: unknown) {
  return { kind: "finding", body, evidence };
}

/** A model response for `produce`. */
export function produceScript(proposals: unknown[]): string {
  return JSON.stringify(proposals);
}

/**
 * When a Review Run still marked `running` is treated as dead.
 *
 * One rule, in one place, for two callers that must not disagree: the Review
 * Store, which decides whether a new delivery may take the Run over, and the
 * Review Run feed, which labels it "interrupted". A screen that calls a Run
 * abandoned while the pipeline still considers it live is a screen that lies.
 *
 * Exported as a *predicate* rather than as the number alone, deliberately. Two
 * call sites comparing against one shared constant are one refactor away from
 * disagreeing about the comparison — `>` against `>=`, or against a different
 * timestamp — and that disagreement would be invisible in both places.
 */

/**
 * Thirty minutes, which is the judgement the feed already commits to in public.
 *
 * The Codebase Index build is the long part of a Run and can approach this on a
 * cold Repository. That is tolerable because indexing spends the platform's own
 * Groq and HuggingFace budget rather than the Installation's Provider Key, so
 * the genuinely expensive window is much shorter than the threshold. The cost
 * of taking over a Run that was in fact alive is a duplicated model call and a
 * comment revised twice — not a wrong report.
 */
export const RUN_ABANDONED_AFTER_MS = 30 * 60 * 1000;

/**
 * Whether a Run that started at `startedAt` has been running long enough to be
 * presumed dead.
 *
 * This is the *fallback* signal, for a job that was lost rather than retried —
 * Redis flushed, a queue drained during a deploy, a human redelivering a
 * webhook weeks later. The primary signal is the queue reporting that it has
 * already handed this job out once, which arrives within seconds and so can
 * never satisfy this test.
 */
export function isRunAbandoned(startedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - startedAt.getTime() > RUN_ABANDONED_AFTER_MS;
}

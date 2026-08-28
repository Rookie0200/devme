import type { ReviewJob } from "../ports";

/**
 * Identity of a unit of review work: this pull request at this head commit.
 *
 * GitHub retries deliveries and supports manual redelivery, so the same job
 * can arrive several times. Keying on the head commit means a redelivery is
 * discarded rather than producing a second Review Run — and, because Runs cost
 * the customer money, a second charge to their Provider Key.
 */
export function reviewJobKey(job: ReviewJob): string {
  return `${job.owner}/${job.repo}#${job.pullRequestNumber}@${job.headSha}`;
}

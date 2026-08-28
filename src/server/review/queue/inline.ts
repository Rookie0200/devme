import type { ReviewJob, ReviewQueue } from "../ports";
import { reviewJobKey } from "./jobKey";

/**
 * Runs each job synchronously on enqueue.
 *
 * This is why the queue is an interface rather than a direct BullMQ call: it
 * lets the whole pipeline run inside a single test, from a signed webhook
 * payload to the comment that lands on the fake GitHub client, with no Redis
 * and no waiting.
 */
export class InlineReviewQueue implements ReviewQueue {
  private readonly seen = new Set<string>();

  constructor(private readonly handler: (job: ReviewJob) => Promise<void>) {}

  async enqueue(job: ReviewJob): Promise<void> {
    const key = reviewJobKey(job);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    await this.handler(job);
  }
}

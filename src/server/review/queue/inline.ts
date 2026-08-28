import type { ReviewJob, ReviewQueue } from "../ports";

/**
 * Runs each job synchronously on enqueue.
 *
 * This is why the queue is an interface rather than a direct BullMQ call: it
 * lets the whole pipeline run inside a single test, from a signed webhook
 * payload to the comment that lands on the fake GitHub client, with no Redis
 * and no waiting.
 *
 * Deliberately does no de-duplication, mirroring the production queue.
 * Discarding a repeated delivery is the database's job — see
 * `PrismaReviewStore.startRun`.
 */
export class InlineReviewQueue implements ReviewQueue {
  constructor(private readonly handler: (job: ReviewJob) => Promise<void>) {}

  async enqueue(job: ReviewJob): Promise<void> {
    await this.handler(job);
  }
}

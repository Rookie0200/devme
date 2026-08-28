import type { ReviewJob, ReviewJobHandler, ReviewQueue } from "../ports";

export interface InlineReviewQueueOptions {
  /**
   * Report every delivery as a re-attempt.
   *
   * Exists solely so the seam test can reach the evidence-based takeover path,
   * which is the one that fires in production. Without it the suite could only
   * ever exercise the elapsed-time fallback, leaving the primary rule verified
   * by hand alone.
   */
  previousAttemptAbandoned?: boolean;
}

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
  constructor(
    private readonly handler: ReviewJobHandler,
    private readonly options: InlineReviewQueueOptions = {},
  ) {}

  async enqueue(job: ReviewJob): Promise<void> {
    // A first attempt unless a test says otherwise, which is what running
    // synchronously on enqueue genuinely means: nothing has been handed out
    // and dropped before this.
    await this.handler(job, {
      previousAttemptAbandoned: this.options.previousAttemptAbandoned ?? false,
    });
  }
}

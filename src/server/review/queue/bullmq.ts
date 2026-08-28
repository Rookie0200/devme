import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";
import type { ReviewJob, ReviewQueue } from "../ports";
import { reviewJobKey } from "./jobKey";

export const REVIEW_QUEUE_NAME = "review";

/**
 * BullMQ against the Redis colocated on the same host — see docs/adr/0002.
 * `maxRetriesPerRequest: null` is BullMQ's requirement for blocking commands.
 */
function connection() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export class BullMqReviewQueue implements ReviewQueue {
  private readonly queue = new Queue<ReviewJob>(REVIEW_QUEUE_NAME, {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });

  async enqueue(job: ReviewJob): Promise<void> {
    // A job id BullMQ already holds — queued, active, or recently completed —
    // is rejected, which is the duplicate-delivery guard on the queue side.
    await this.queue.add("review", job, { jobId: reviewJobKey(job) });
  }
}

/** Started by the worker process, not by the Next.js server. */
export function startReviewWorker(handler: (job: ReviewJob) => Promise<void>) {
  return new Worker<ReviewJob>(
    REVIEW_QUEUE_NAME,
    async (job) => {
      await handler(job.data);
    },
    { connection: connection(), concurrency: 2 },
  );
}

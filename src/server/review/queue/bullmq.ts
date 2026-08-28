import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";
import type { ReviewJob, ReviewJobHandler, ReviewQueue } from "../ports";

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
    // No `jobId`, and so no de-duplication here. Keying on the head commit
    // seemed like a free second guard against charging a Provider Key twice,
    // but it claimed a commit for as long as BullMQ retained the completed
    // job — and it is too coarse to tell a redelivery from a genuinely new
    // attempt at the same commit. A pull request declined as Unlinked and
    // then reopened with its link added fires at the *same* head commit, and
    // was silently dropped here before ever reaching the pipeline.
    //
    // The durable guard is the unique constraint on (reviewId, headSha) in
    // `PrismaReviewStore.startRun`: it is transactional, it is not bounded by
    // a retention window, and it can distinguish a Run that was completed
    // from one that only declined.
    await this.queue.add("review", job);
  }
}

/** Started by the worker process, not by the Next.js server. */
export function startReviewWorker(handler: ReviewJobHandler) {
  return new Worker<ReviewJob>(
    REVIEW_QUEUE_NAME,
    async (job) => {
      // `attemptsStarted` counts how many times this job has been handed to a
      // worker, this delivery included, so anything above one means a previous
      // attempt was handed out and never finished.
      //
      // Not `attemptsMade`, which counts only attempts that *failed loudly*.
      // A worker killed mid-job never reaches the failure path: BullMQ's
      // stalled-job recovery increments the stalled counter and re-queues,
      // leaving `attemptsMade` at zero. That is the exact case this signal
      // exists for, so reading it would have missed every one of them and
      // caught only the retries that were never stuck.
      await handler(job.data, {
        previousAttemptAbandoned: job.attemptsStarted > 1,
      });
    },
    { connection: connection(), concurrency: 2 },
  );
}

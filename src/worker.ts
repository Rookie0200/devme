import { startReviewWorker } from "@/server/review/queue/bullmq";
import { handleReviewJob } from "@/server/review/deps";

/**
 * The BullMQ worker process.
 *
 * Runs as its own container beside the Next.js server, Postgres, and Redis —
 * see docs/adr/0002. Indexing is a sequential per-file summarise-and-embed
 * job measured in minutes, which is exactly why it lives here rather than on
 * a request path.
 */
const worker = startReviewWorker(handleReviewJob);

worker.on("failed", (job, error) => {
  console.error(`[review] job ${job?.id ?? "unknown"} failed:`, error);
});

worker.on("ready", () => {
  console.log("[review] worker ready");
});

async function shutdown(signal: string) {
  console.log(`[review] ${signal} received, draining`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

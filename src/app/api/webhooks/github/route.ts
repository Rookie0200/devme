import { env } from "@/env";
import { handleGithubWebhook } from "@/server/review/webhookHandler";
import { BullMqReviewQueue } from "@/server/review/queue/bullmq";
import { reviewStore } from "@/server/review/deps";

/**
 * GitHub webhook ingress.
 *
 * The handler verifies the signature, enqueues, and returns — the review
 * itself runs in the worker process, because GitHub will mark an endpoint
 * unhealthy if it does not answer quickly.
 */

export const runtime = "nodejs";
// Signature verification needs the exact bytes GitHub sent, so nothing here
// may be cached or statically evaluated.
export const dynamic = "force-dynamic";

const queue = new BullMqReviewQueue();

export function POST(request: Request): Promise<Response> {
  return handleGithubWebhook(request, {
    secret: env.GITHUB_WEBHOOK_SECRET,
    store: reviewStore,
    queue,
  });
}

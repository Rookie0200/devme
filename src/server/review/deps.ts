import type { PipelineDeps } from "./pipeline";
import { runReview } from "./pipeline";
import { PrismaReviewStore } from "./store/prismaStore";
import { PrismaModelProviderFactory } from "./model/factory";
import { PrismaCodebaseIndex } from "./index/codebaseIndex";
import { OctokitGitHubClient } from "./github/appClient";
import type { ReviewDelivery, ReviewJob } from "./ports";

/** The single production wiring, shared by the web process and the worker. */
export const reviewStore = new PrismaReviewStore();

export function productionDeps(installationGithubId: number): PipelineDeps {
  return {
    store: reviewStore,
    githubFor: (id) => OctokitGitHubClient.forInstallation(id),
    models: new PrismaModelProviderFactory(),
    index: new PrismaCodebaseIndex(installationGithubId),
  };
}

/** What the BullMQ worker runs for each dequeued job. */
export function handleReviewJob(
  job: ReviewJob,
  delivery: ReviewDelivery,
): Promise<void> {
  return runReview(job, productionDeps(job.installationGithubId), delivery);
}

import { redeliverWebhookDelivery } from "@/server/review/github/appClient";

/**
 * App-level GitHub administrative actions, as distinct from `GitHubIdentity`
 * (which Installations a *user* can reach) and `GitHubClient` (repository
 * access scoped to one Installation's token). An interface for the same
 * reason as both: a router must be able to substitute a fake without
 * reaching the network.
 */
export interface GitHubAppAdmin {
  /** See `redeliverWebhookDelivery` in `review/github/appClient.ts`. */
  redeliverWebhook(deliveryId: string): Promise<void>;
}

export class OctokitGitHubAppAdmin implements GitHubAppAdmin {
  async redeliverWebhook(deliveryId: string): Promise<void> {
    await redeliverWebhookDelivery(deliveryId);
  }
}

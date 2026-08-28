import { client } from "@/server/db";
import { env } from "@/env";
import type { ModelProvider, ModelProviderFactory } from "../ports";
import { decryptProviderKey } from "../crypto/providerKey";
import { AnthropicModelProvider } from "./anthropic";

/**
 * Resolves an Installation's Provider Key and binds a model provider to it.
 *
 * `null` — no key, or a key that never passed validation — is a reportable
 * state rather than an error: the pull request gets a comment saying so and no
 * Review Run is recorded.
 */
export class PrismaModelProviderFactory implements ModelProviderFactory {
  async forInstallation(installationId: string): Promise<ModelProvider | null> {
    const key = await client.providerKey.findUnique({
      where: { installationId },
    });
    if (key?.validatedAt == null) return null;

    const apiKey = decryptProviderKey(key, env.ENCRYPTION_MASTER_KEY);
    return new AnthropicModelProvider(apiKey);
  }
}

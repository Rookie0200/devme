import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type {
  ModelCompletion,
  ModelProvider,
  ReviewOutcomeReason,
} from "../ports";

/**
 * The Anthropic-backed Producer/Verifier model.
 *
 * Anthropic is the only supported provider at MVP so that one prompt suite is
 * tuned against one model's behaviour. Calls go through the provider-agnostic
 * AI SDK, so adding a second provider later is configuration rather than a
 * rewrite.
 *
 * Every call here is paid for by the Installation's own Provider Key. Indexing
 * is a separate, platform-funded pipeline and does not come through this file.
 */

/**
 * Override per Installation later; one model, one tuned prompt suite for now.
 *
 * Haiku 4.5 is the deliberate floor: the Verifier, not the Producer's raw
 * judgement, is what keeps an ungrounded proposal off a pull request, so the
 * cheapest model that can follow the prompt is the right place to start. Moving
 * up the range is a decision to make against measured output on a corpus of
 * real pull requests, not against an assumption that dearer reads better.
 */
export const DEFAULT_REVIEW_MODEL = "claude-haiku-4-5";

/**
 * USD per million tokens. Used only to record what a Review Run cost — it is
 * not a billing surface, because the customer is billed by their provider.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Thinking is on by default on Opus 5 and `maxOutputTokens` caps thinking plus
 * response text together, so this needs headroom well beyond the JSON we
 * actually want back.
 */
const MAX_OUTPUT_TOKENS = 16_000;

function costUsd(model: string, inputTokens: number, outputTokens: number) {
  const rate = PRICING[model];
  if (!rate) return 0;
  return (
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  );
}

export class AnthropicModelProvider implements ModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly modelId: string = DEFAULT_REVIEW_MODEL,
  ) {}

  async complete(input: {
    system: string;
    prompt: string;
  }): Promise<ModelCompletion> {
    const anthropic = createAnthropic({ apiKey: this.apiKey });

    // No `temperature`: it is rejected outright on Opus 5. Prompting is the
    // supported way to steer this model.
    const result = await generateText({
      model: anthropic(this.modelId),
      system: input.system,
      prompt: input.prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return {
      text: result.text,
      model: this.modelId,
      costUsd: costUsd(
        this.modelId,
        result.usage.inputTokens ?? 0,
        result.usage.outputTokens ?? 0,
      ),
    };
  }

  classifyFailure(error: unknown): ReviewOutcomeReason {
    return classifyAnthropicFailure(error);
  }
}

/**
 * The outcome of checking a Provider Key.
 *
 * `reason` is written to be shown to whoever pasted the key, because the
 * difference between "wrong string" and "right string, wrong kind of key" is
 * the difference between a useful message and a dead end.
 */
export type ProviderKeyCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * A cheap live call, so that a typo fails at save time rather than silently
 * breaking every review.
 *
 * Reports an unusable credential as `ok: false`, and throws for anything else
 * — a network blip should not be reported to the user as a bad key.
 */
export async function validateProviderKey(
  apiKey: string,
): Promise<ProviderKeyCheck> {
  const anthropic = createAnthropic({ apiKey });
  try {
    await generateText({
      model: anthropic(DEFAULT_REVIEW_MODEL),
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 16,
      maxRetries: 0,
    });
    return { ok: true };
  } catch (error) {
    const reason = rejectionReason(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
}

/**
 * Why the provider refused this credential, or `null` if the failure was not
 * about the credential at all.
 *
 * An identity-linked key is a 400 rather than a 401: the key itself is real,
 * but it carries no workspace, so every call needs a header this application
 * does not send. Treating that as an unreachable-provider error tells the user
 * to retry something that can never succeed.
 */
function rejectionReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;

  const { statusCode, message, responseBody } = error as {
    statusCode?: unknown;
    message?: unknown;
    responseBody?: unknown;
  };

  if (statusCode === 401 || statusCode === 403) {
    return "Anthropic rejected that key.";
  }

  const detail = `${typeof message === "string" ? message : ""} ${
    typeof responseBody === "string" ? responseBody : ""
  }`;
  if (statusCode === 400 && detail.includes("anthropic-workspace-id")) {
    return (
      "That key is identity-linked, so it cannot be used on its own. " +
      "Create a workspace-scoped key at platform.claude.com/settings/keys and paste that instead."
    );
  }

  return null;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const { statusCode } = error as { statusCode?: unknown };
  return typeof statusCode === "number" ? statusCode : null;
}

/**
 * How a failure raised while spending this Provider Key should be recorded.
 *
 * Reuses `rejectionReason` so the is-this-the-credential judgement is made in
 * exactly one place — including the identity-linked-key case, which nobody
 * rediscovers by reasoning about it.
 *
 * Everything not clearly the provider's is `internal`. A Verifier bug, a
 * GitHub timeout, and a genuine outage all reach the pipeline's catch
 * together, and guessing between them would put a warning on a customer's
 * dashboard accusing a credential that is fine.
 */
export function classifyAnthropicFailure(error: unknown): ReviewOutcomeReason {
  if (rejectionReason(error) !== null) return "provider_auth";

  // Only where the error identifies itself: rate limiting, overload, and the
  // 5xx range are the provider saying it could not serve the request.
  const status = statusOf(error);
  if (status !== null && (status === 429 || status >= 500)) {
    return "provider_unavailable";
  }

  return "internal";
}

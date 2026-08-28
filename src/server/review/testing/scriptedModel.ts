import type {
  ModelCompletion,
  ModelProvider,
  ModelProviderFactory,
  ReviewOutcomeReason,
} from "../ports";

type Purpose = "extract-criteria" | "produce";

/**
 * A model provider returning fixed responses.
 *
 * Model output is scripted, never sampled, so that every test is
 * deterministic. This means the suite verifies the *pipeline* — that a
 * grounded proposal survives, that an ungrounded one is discarded — and says
 * nothing about whether the model's judgement is any good. Judgement quality
 * is assessed separately, by hand, against a corpus of real pull requests.
 */
export class ScriptedModelProvider implements ModelProvider {
  /** Every prompt the pipeline sent, for debugging a failing test only. */
  readonly calls: Array<{ purpose: Purpose; prompt: string }> = [];

  private readonly scripts: Record<Purpose, string[]>;

  constructor(scripts: Partial<Record<Purpose, string[]>>) {
    this.scripts = {
      "extract-criteria": [...(scripts["extract-criteria"] ?? [])],
      produce: [...(scripts.produce ?? [])],
    };
  }

  complete(input: {
    system: string;
    prompt: string;
    purpose: Purpose;
  }): Promise<ModelCompletion> {
    this.calls.push({ purpose: input.purpose, prompt: input.prompt });

    const queued = this.scripts[input.purpose];
    const text = queued.shift();
    if (text === undefined) {
      throw new Error(
        `scripted model exhausted for purpose "${input.purpose}" — the test asked for more completions than it scripted`,
      );
    }

    return Promise.resolve({
      text,
      model: "claude-scripted",
      costUsd: 0.01,
    });
  }

  /**
   * Whatever a test wants a raised failure recorded as. `internal` by default,
   * matching a real provider's answer for anything it does not recognise as
   * its own.
   */
  classifyFailure(): ReviewOutcomeReason {
    return this.failureReason;
  }

  failureReason: ReviewOutcomeReason = "internal";
}

/** Hands the same scripted provider to every Installation. */
export class ScriptedModelFactory implements ModelProviderFactory {
  constructor(private readonly provider: ModelProvider | null) {}

  forInstallation(): Promise<ModelProvider | null> {
    return Promise.resolve(this.provider);
  }
}

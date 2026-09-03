import Groq, { NotFoundError } from "groq-sdk";
import { Document } from "@langchain/core/documents";
import { HfInference } from "@huggingface/inference";

// Lazily constructed, like githubApp() in server/review/github/appClient.ts:
// this module is imported by the /dashboard page tree, so throwing here at
// module scope means `next build` fails without GROQ_API_KEY and HF_TOKEN set
// — which the Docker build stage never has (only SKIP_ENV_VALIDATION=1 is).
// Deferring the check to first actual use keeps the build key-free and still
// fails loudly the moment indexing tries to call out without one.
let hf: HfInference | undefined;
function hfClient(): HfInference {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    throw new Error("HF_TOKEN is required for HuggingFace API");
  }
  hf ??= new HfInference(hfToken);
  return hf;
}

let groq: Groq | undefined;
function groqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not provided");
  }
  groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

// Groq retires hosted models, and a stale default fails as a 404
// `model_not_found` on every call. Override with GROQ_CHAT_MODEL; check
// https://console.groq.com/docs/models when this 404s.
const CHAT_MODEL = process.env.GROQ_CHAT_MODEL ?? "openai/gpt-oss-20b";

/**
 * A retired or misspelled chat model, distinguished from a per-file failure.
 *
 * The distinction is what a caller needs to know: every other failure is about
 * one file and the next file may well succeed, but this one fails identically
 * for every file in the repository. Callers that tolerate per-file failures
 * must stop on this rather than swallow it — see `generateEmbeddings`.
 *
 * Groq's error shapes stay in this module, the same way the pipeline never
 * learns one vendor's, so the indexing path can branch on a type it owns.
 */
export class ChatModelUnavailableError extends Error {
  constructor(readonly model: string, cause: unknown) {
    super(
      `Groq rejected chat model "${model}" as unavailable. It has probably ` +
        `been retired — set GROQ_CHAT_MODEL to a current one from ` +
        `https://console.groq.com/docs/models`,
      { cause },
    );
    this.name = "ChatModelUnavailableError";
  }
}

// Retry config
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  retryDelay = INITIAL_RETRY_DELAY_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if ((msg.includes("429") || msg.includes("rate")) && retries > 0) {
      console.log(`⏳ Rate limited. Retry in ${retryDelay / 1000}s (${retries} left)`);
      await delay(retryDelay);
      return withRetry(fn, retries - 1, retryDelay * 2);
    }
    throw error;
  }
}

interface GroqChatResponse {
  choices: Array<{ message?: { content?: string } }>;
}

async function chat(
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: { temperature: number; max_tokens: number },
): Promise<string> {
  try {
    const res = (await withRetry(() =>
      groqClient().chat.completions.create({
        model: CHAT_MODEL,
        messages,
        ...options,
      }),
    )) as GroqChatResponse;
    return res.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new ChatModelUnavailableError(CHAT_MODEL, error);
    }
    throw error;
  }
}

/**
 * Summarize code for onboarding. Optimized prompt for minimal tokens.
 */
export const summariseCode = async (doc: Document): Promise<string> => {
  const filePath = doc.metadata.source as string;
  // Truncate to ~800 chars to save tokens; adjust if needed
  const code = doc.pageContent.slice(0, 800);

  return chat(
    [
      {
        role: "system",
        content:
          "You are a senior engineer. Summarize code concisely for onboarding. Max 80 words. Focus on purpose and key logic.",
      },
      {
        role: "user",
        content: `File: ${filePath}\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ],
    {
      temperature: 0.2,
      // Headroom for a reasoning model. These spend the budget thinking before
      // emitting anything, so a tight cap returns an *empty* summary rather
      // than a short one. `generateEmbeddings` treats an empty summary as a
      // failed file rather than embedding it, but the cap is still sized to
      // avoid triggering that path routinely. 80 words needs ~120; the rest is
      // the reasoning the cap has to survive.
      max_tokens: 400,
    },
  );
};

/**
 * Summarize a git diff. Optimized for commit logs.
 */
export const aiSummarizeCommit = async (diff: string): Promise<string> => {
  // Cap diff size to avoid blowing token budget
  const truncatedDiff = diff.slice(0, 4000);

  return chat(
    [
      {
        role: "system",
        content:
          "Summarize git diff as bullet points. Include [filename]. Be concise, max 5 bullets.",
      },
      {
        role: "user",
        content: truncatedDiff,
      },
    ],
    { temperature: 0.2, max_tokens: 200 },
  );
};



export async function generateEmbeddingsFromAi(
  summary: string
): Promise<number[]> {
  // 768-dim output to satisfy the vector column expectation
  const model = "sentence-transformers/all-mpnet-base-v2";
  const res = await withRetry(() =>
    hfClient().featureExtraction({
      model,
      inputs: summary,
      options: {
        wait_for_model: true,
      },
    })
  );


  if (Array.isArray(res)) {
    if (Array.isArray(res[0])) {
      return res[0] as number[];
    }
    return res as number[];
  }

  throw new Error("Unexpected response format from HuggingFace");
}
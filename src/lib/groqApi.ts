import Groq from "groq-sdk";
import { Document } from "@langchain/core/documents";
import { HfInference } from "@huggingface/inference";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not provided");
}

const hfToken = process.env.HF_TOKEN;
if (!hfToken) {
  throw new Error("HF_TOKEN is required for HuggingFace API");
}

const hf = new HfInference(hfToken);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model selection: 8b for speed/cost, 70b for quality
const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant";

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

/**
 * Summarize code for onboarding. Optimized prompt for minimal tokens.
 */
export const summariseCode = async (doc: Document): Promise<string> => {
  const filePath = doc.metadata.source as string;
  // Truncate to ~800 chars to save tokens; adjust if needed
  const code = doc.pageContent.slice(0, 800);

  const res = await withRetry(() =>
    groq.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
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
      temperature: 0.2,
      max_tokens: 120,
    })
  ) as GroqChatResponse;

  return res.choices[0]?.message?.content?.trim() || "";
};

/**
 * Summarize a git diff. Optimized for commit logs.
 */
export const aiSummarizeCommit = async (diff: string): Promise<string> => {
  // Cap diff size to avoid blowing token budget
  const truncatedDiff = diff.slice(0, 4000);

  const res = await withRetry(() =>
    groq.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
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
      temperature: 0.2,
      max_tokens: 200,
    })
  ) as GroqChatResponse;

  return res.choices[0]?.message?.content?.trim() || "";
};



export async function generateEmbeddingsFromAi(
  summary: string
): Promise<number[]> {
  // 768-dim output to satisfy the vector column expectation
  const model = "sentence-transformers/all-mpnet-base-v2";
  const res = await withRetry(() =>
    hf.featureExtraction({
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
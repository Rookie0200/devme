import { GoogleGenerativeAI } from "@google/generative-ai";
import { Document } from "@langchain/core/documents";
if (!process.env.GEMINI_API) {
  throw new Error("GEMINI_API is not provided");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
const model = genAI.getGenerativeModel({
  model: `gemini-2.5-flash`,
});

// Rate limiting configuration for free tier (5 requests per minute)
const RATE_LIMIT_DELAY_MS = 15000; // 15 seconds between requests (safe for 5/min limit)
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 60000; // 60 seconds initial retry delay

// Helper function to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to make API calls with retry logic
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  retryDelay = INITIAL_RETRY_DELAY_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's a rate limit error (429)
    if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests")) {
      if (retries > 0) {
        console.log(`⏳ Rate limited. Waiting ${retryDelay / 1000}s before retry... (${retries} retries left)`);
        await delay(retryDelay);
        // Exponential backoff: double the delay for next retry
        return withRetry(fn, retries - 1, retryDelay * 1.5);
      }
    }
    throw error;
  }
}

// Track last API call time to enforce rate limiting
let lastApiCallTime = 0;

async function rateLimitedApiCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  
  if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - timeSinceLastCall;
    console.log(`⏳ Rate limiting: waiting ${(waitTime / 1000).toFixed(1)}s...`);
    await delay(waitTime);
  }
  
  lastApiCallTime = Date.now();
  return withRetry(fn);
}

export const aiSummarizeCommit = async (diff: string) => {
  try {
    console.log("Starting AI summarization...");
    const aiResponse = await model.generateContent([
      `
Please summarise the following diff file:

\`\`\`
For every file, there are a few metadata lines, like (for example):
diff --git a/lib/index.js b/lib/index.js
index aadf691..bfef603 100644
--- a/lib/index.js
+++ b/lib/index.js
\`\`\`

This means that \`lib/index.js\` was modified in this commit. Note that this is only an example.
Then there is a specifier of the lines that were modified.
A line starting with '+' means it was added.
A line starting with '-' means that line was deleted.
A line that starts with neither '+' nor '-' is code given for context and better understanding.
It is not part of the diff.

EXAMPLE SUMMARY COMMENTS:
\`\`\`
* Raised the amount of returned recordings from 10 to 100 [packages/server/recordings_api.ts], [packages/server/constants.ts]
* Fixed a typo in the github action name [.github/workflows/gpt-commit-summarizer.yml]
* Moved the \`octokit\` initialization to a separate file [src/octokit.ts], [src/index.ts]
* Added an OpenAI API for completions [packages/utils/apis/openai.ts]
* Lowered numeric tolerance for test files
\`\`\`

Most commits will have less comments than this example list.
The last comment does not include the file names because there were more than two relevant files in the hypothetical commit.
Do not include parts of the example in your summary.
It is given only as an example of appropriate comments.

Please summarise the following diff file:\n\n${diff}`,
    ]);
    const summary = aiResponse.response.text();
    console.log("AI summarization successful, length:", summary.length);
    return summary;
  } catch (error) {
    console.error("Error in aiSummarizeCommit:", error);
    throw error;
  }
};

export const summariseCode = async (doc: Document) => {
  console.log("getting summary for", doc.metadata.source);
  const code = doc.pageContent.slice(0, 1000);
  
  const response = await rateLimitedApiCall(() => 
    model.generateContent([
      `You are an intelligent senior software engineer who specialises in onboarding junior software engineer onto projects`,
      `You are onboarding a new junior software engineer onto a project. You have been given a code snippet from the project along with its file path: ${doc.metadata.source}. Your task is to provide a concise and clear summary of what this code does, its purpose within the project, and any important details that would help the junior engineer understand it quickly.`,
      `Here is the code snippet:\n\n${code}\n\n`,
      `Please provide a summary no more than 100 words that would help a junior software engineer understand the code's functionality and purpose within the project. Keep the summary concise and focused on the most important aspects.`,
    ])
  );
  return response.response.text();
};


export async function generateEmbeddingsFromAi(summary:string){
  const embeddingModel = genAI.getGenerativeModel({
    model: "text-embedding-004"
  })
  
  const result = await rateLimitedApiCall(() => 
    embeddingModel.embedContent(summary)
  );
  const embedding = result.embedding
  return embedding.values
}

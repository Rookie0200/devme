import { GoogleGenerativeAI } from "@google/generative-ai";
import { Document } from "@langchain/core/documents";
if (!process.env.GEMINI_API) {
  throw new Error("GEMINI_API is not provided");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
const model = genAI.getGenerativeModel({
  model: `gemini-2.5-flash`,
});

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
  const response = await model.generateContent([
    `You are an intelligent senior software engineer who specialises in onboarding junior software engineer onto projects`,
    `You are onboarding a new junior software engineer onto a project. You have been given a code snippet from the project along with its file path: ${doc.metadata.source}. Your task is to provide a concise and clear summary of what this code does, its purpose within the project, and any important details that would help the junior engineer understand it quickly.`,
    `Here is the code snippet:\n\n${code}\n\n`,
    `Please provide a summary no more than 100 words that would help a junior software engineer understand the code's functionality and purpose within the project. Keep the summary concise and focused on the most important aspects.`,
  ]);
  return response.response.text();
};


export async function generateEmbeddingsFromAi(summary:string){
  const model = genAI.getGenerativeModel({
    model: "text-embedding-001"
  })
  const result = await model.embedContent(summary)
  const embedding = result.embedding
  return embedding.values
}

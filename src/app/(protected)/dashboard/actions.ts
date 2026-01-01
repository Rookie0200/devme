// "use server";

// import { streamText } from "ai";
// import { createStreamableValue } from "@ai-sdk/rsc";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";

// if (!process.env.GOOGLE_API_KEY) {
//   throw new Error("Missing GOOGLE_API_KEY env var");
// }
// const google = createGoogleGenerativeAI({
//   apiKey: process.env.GOOGLE_API_KEY,
// });

// export async function askQuestionAction(question: string, projectId: string) {
//   const response = await google.chat.completions.create({
//     model: "gemini-1.5-pro",
//     messages: [
//       {
//         role: "system",
//         content:
//           "You are CommitLytic, an AI assistant that helps developers understand their code commits and repositories. Provide concise and accurate answers based on the commit history and repository data.",
//       },
//       {
//         role: "user",
//         content: question,
//       },
//     ],
//     stream: true,
//   });

//   const stream = streamText(response);

//   return createStreamableValue(stream);
// }

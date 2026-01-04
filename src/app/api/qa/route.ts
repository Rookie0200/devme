import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddingsFromAi } from "@/lib/groqApi";
import { client } from "@/server/db";
import Groq from "groq-sdk";

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant";

// Type for vector search results
interface SourceCodeMatch {
  fileName: string;
  sourceCode: string;
  summary: string;
  similarity: number;
}

/**
 * POST /api/qa
 * 
 * Request body: { question: string, projectId: string }
 * Response: Streaming text with file references in header
 * 
 * Flow:
 * 1. Generate embedding from question using HuggingFace
 * 2. Vector similarity search in PostgreSQL (pgvector)
 * 3. Build context from matched source code
 * 4. Stream LLM response using Groq
 */
export async function POST(request: NextRequest) {
  try {
    const { question, projectId } = await request.json();

    // Validate inputs
    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Step 1: Generate embedding from the question
    console.log("🔍 Generating embedding for question...");
    const queryVector = await generateEmbeddingsFromAi(question);
    const vectorQuery = `[${queryVector.join(",")}]`;

    // Step 2: Vector similarity search
    console.log("📊 Searching for relevant code...");
    
    // First, check what similarity scores we're getting (for debugging)
    const allResults = (await client.$queryRaw`
      SELECT "fileName", "sourceCode", "summary",
        1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) AS similarity
      FROM "SourceCodeEmbedding"
      WHERE "projectId" = ${projectId}
        AND "summaryEmbedding" IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 10
    `) as SourceCodeMatch[];
    
    console.log(`📊 All similarity scores:`, allResults.map(r => ({ file: r.fileName, similarity: r.similarity })));
    
    // Filter by threshold (0.12 is reasonable for embedding similarity)
    let results = allResults.filter(r => r.similarity > 0.12);
    
    // Fallback: if no results pass threshold, take top 5 anyway
    if (results.length === 0 && allResults.length > 0) {
      results = allResults.slice(0, 5);
      console.log(`⚠️ No files passed threshold, using top ${results.length} results`);
    } else {
      console.log(`✅ Found ${results.length} relevant files (threshold > 0.12)`);
    }

    // Step 3: Build context from matched files
    let context = "";
    if (results.length === 0) {
      context = "No relevant code found in the project.";
    } else {
      for (const doc of results) {
        context += `### File: ${doc.fileName}\n`;
        context += `**Summary:** ${doc.summary}\n`;
        context += `**Code:**\n\`\`\`\n${doc.sourceCode.slice(0, 1500)}\n\`\`\`\n\n`;
      }
    }

    // Step 4: Stream response from Groq
    const systemPrompt = `You are an expert software developer assistant helping users understand their codebase. 
You have access to source code from the user's project. Answer questions based on the provided context.

Guidelines:
- Be concise and direct
- Reference specific files when relevant
- If the context doesn't contain enough information, say so
- Use code snippets when helpful
- Format responses with markdown`;

    const userPrompt = `## Context (Relevant Source Code)
${context}

## User Question
${question}

Please answer the question based on the context above.`;

    // Create streaming response
    const groqStream = await groq.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: true, // Enable streaming
    });

    // Convert Groq stream to Web ReadableStream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of groqStream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    // Return streaming response with file references in header
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-File-References": encodeURIComponent(JSON.stringify(results)),
      },
    });
  } catch (error) {
    console.error("Q&A API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

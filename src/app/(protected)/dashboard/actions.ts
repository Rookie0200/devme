"use server";

import { generateEmbeddingsFromAi } from "@/lib/groqApi";
import { client } from "@/server/db";
import { indexGithubRepo } from "@/lib/githubRepoLoader";

// Type for vector search results
interface SourceCodeMatch {
  fileName: string;
  sourceCode: string;
  summary: string;
  similarity: number;
}

/**
 * Search for relevant source code based on a query.
 * Uses vector similarity search with pgvector.
 *
 * @param query - The search query or question
 * @param projectId - The project ID to search within
 * @returns Array of matching source code snippets with similarity scores
 */
export async function searchCodebase(
  query: string,
  projectId: string
): Promise<SourceCodeMatch[]> {
  // Generate embedding from the query
  const queryVector = await generateEmbeddingsFromAi(query);
  const vectorQuery = `[${queryVector.join(",")}]`;

  // Vector similarity search
  const results = await client.$queryRaw<SourceCodeMatch[]>`
    SELECT "fileName", "sourceCode", "summary",
      1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) AS similarity
    FROM "SourceCodeEmbedding"
    WHERE 1 - ("summaryEmbedding" <=> ${vectorQuery}::vector) > 0.5
      AND "projectId" = ${projectId}
    ORDER BY similarity DESC
    LIMIT 10
  `;

  return results;
}

/**
 * Get the count of indexed files for a project.
 * Useful for showing indexing status.
 */
export async function getIndexedFileCount(projectId: string): Promise<number> {
  const result = await client.sourceCodeEmbedding.count({
    where: { projectId },
  });
  return result;
}

/**
 * Manually trigger re-indexing of a project's repository.
 * Use this if initial indexing failed or to update embeddings.
 */
export async function reindexProject(projectId: string): Promise<{ success: boolean; message: string }> {
  try {
    const project = await client.project.findUnique({
      where: { id: projectId },
      select: { githubUrl: true },
    });

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    // Delete existing embeddings first
    await client.sourceCodeEmbedding.deleteMany({
      where: { projectId },
    });

    console.log(`🔄 Re-indexing project: ${projectId}`);
    
    // Trigger indexing in background
    // No per-project token any more: repository access comes from a GitHub App
    // installation token. See docs/adr/0001.
    indexGithubRepo(projectId, project.githubUrl)
      .then(() => {
        console.log(`✅ Re-indexing completed for: ${projectId}`);
      })
      .catch((error) => {
        console.error(`❌ Re-indexing failed for ${projectId}:`, error);
      });

    return { success: true, message: "Indexing started in background. This may take a few minutes." };
  } catch (error) {
    console.error("Error triggering re-index:", error);
    return { success: false, message: error instanceof Error ? error.message : "Failed to start indexing" };
  }
}

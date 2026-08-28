import { client, withDbRetry } from "@/server/db";
import { generateEmbeddingsFromAi } from "@/lib/groqApi";
import {
  filterDocsForEmbedding,
  generateEmbeddings,
  loadGithubRepo,
} from "@/lib/githubRepoLoader";
import type { CodebaseIndex } from "../ports";
import { mintInstallationToken } from "../github/appClient";

/**
 * The Codebase Index, supplying a Review with context the diff cannot show.
 *
 * Indexing is paid for by the platform and keeps using the existing cheap
 * summarisation and embedding pipeline — only Producers and the Verifier
 * consume the Installation's Provider Key. It is lazy: built the first time a
 * Repository produces a pull request, so an organisation granting access to
 * two hundred repositories does not trigger two hundred indexing jobs.
 */

interface SourceCodeMatch {
  fileName: string;
  summary: string;
  similarity: number;
}

/**
 * Matches the threshold `/api/qa` uses, but deliberately *not* its top-5
 * fallback: an empty result here means the Producer gets no codebase context
 * and says so, which is better than feeding it five irrelevant files and
 * inviting a confidently wrong verdict.
 */
const SIMILARITY_THRESHOLD = 0.12;
const MAX_MATCHES = 10;

export class PrismaCodebaseIndex implements CodebaseIndex {
  constructor(private readonly installationGithubId: number) {}

  async ensureIndexed(input: {
    repositoryId: string;
    owner: string;
    repo: string;
  }): Promise<void> {
    const existing = await client.sourceCodeEmbedding.count({
      where: { repositoryId: input.repositoryId },
    });
    if (existing > 0) return;

    // A private repository is only readable with an installation token.
    const token = await mintInstallationToken(this.installationGithubId);
    const docs = await loadGithubRepo(
      `https://github.com/${input.owner}/${input.repo}`,
      token,
    );

    const embeddings = await generateEmbeddings(filterDocsForEmbedding(docs));

    for (const embedding of embeddings) {
      if (!embedding) continue;
      // `generateEmbeddings` reads these off LangChain document metadata, which
      // is untyped, so they are narrowed here rather than trusted.
      const summary = String(embedding.summary);
      const sourceCode = String(embedding.sourceCode);
      const fileName = String(embedding.fileName);

      await withDbRetry(async () => {
        const row = await client.sourceCodeEmbedding.create({
          data: {
            summary,
            sourceCode,
            fileName,
            repositoryId: input.repositoryId,
          },
        });
        // Prisma cannot write an `Unsupported` column, so the vector is set
        // by a separate raw update.
        const vector = `[${embedding.embedding.join(",")}]`;
        await client.$executeRaw`
          UPDATE "SourceCodeEmbedding"
          SET "summaryEmbedding" = ${vector}::vector
          WHERE "id" = ${row.id}
        `;
      });
    }
  }

  async search(input: {
    repositoryId: string;
    query: string;
  }): Promise<string> {
    if (input.query.trim() === "") return "";

    const queryVector = await generateEmbeddingsFromAi(input.query);
    const vector = `[${queryVector.join(",")}]`;

    const matches = await client.$queryRaw<SourceCodeMatch[]>`
      SELECT "fileName", "summary",
        1 - ("summaryEmbedding" <=> ${vector}::vector) AS similarity
      FROM "SourceCodeEmbedding"
      WHERE "repositoryId" = ${input.repositoryId}
        AND "summaryEmbedding" IS NOT NULL
        AND 1 - ("summaryEmbedding" <=> ${vector}::vector) > ${SIMILARITY_THRESHOLD}
      ORDER BY similarity DESC
      LIMIT ${MAX_MATCHES}
    `;

    // Summaries rather than source: the Producer needs to know how the
    // codebase already works, not to re-read it.
    return matches
      .map((match) => `### ${match.fileName}\n${match.summary}`)
      .join("\n\n");
  }
}

-- AlterTable
ALTER TABLE "ReviewRun" ADD COLUMN     "githubDeliveryId" TEXT;

-- Prisma cannot see SourceCodeEmbedding_summaryEmbedding_hnsw_idx because the
-- column it covers is Unsupported, so it always reads as stale here. Do not
-- apply a DROP INDEX for it — see the note in 20260828154110_review_run_outcomes.

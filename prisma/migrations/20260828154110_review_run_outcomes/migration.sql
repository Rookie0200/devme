-- Recording the outcome of every delivery, not only the ones that reviewed.
--
-- `declinedAt` is dropped rather than migrated: the fact it carried — that
-- this Review has been declined — is now expressed by a Run with status
-- 'declined', and `hasDeclinedRun` derives it. Reviews declined before this
-- migration have no such Run, so each will render its declining comment once
-- more on its next delivery and then fall quiet. That is a one-time cosmetic
-- effect on already-declined pull requests, not a loss of data.
--
-- NOTE: `prisma migrate dev` also generated a `DROP INDEX` for
-- "SourceCodeEmbedding_summaryEmbedding_hnsw_idx", which has been removed by
-- hand. That index is created in 20260827090000_pull_request_review and cannot
-- be expressed in schema.prisma, because the column it covers is
-- `Unsupported("vector(768)")`. Prisma therefore cannot see it, believes it is
-- stale, and proposes dropping it on every migration touching this schema.
-- Dropping it would silently turn every Codebase Index search into a
-- sequential scan. Check for this line whenever a migration is regenerated.

-- AlterEnum
-- Safe inside Prisma's transaction on PostgreSQL 12+: a newly added enum value
-- may not be *used* in the transaction that adds it, and nothing here does.
-- Any migration that writes 'declined' to existing rows must be a separate
-- one.
ALTER TYPE "ReviewRunStatus" ADD VALUE 'declined';

-- AlterTable
ALTER TABLE "ProviderKey" ADD COLUMN     "lastAuthFailureAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "declinedAt",
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "ReviewRun" ADD COLUMN     "outcomeReason" TEXT;

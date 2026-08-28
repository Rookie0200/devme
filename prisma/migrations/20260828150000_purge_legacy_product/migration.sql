-- Removes the legacy Q&A and meeting product from the database.
--
-- Hand-written rather than generated, for the same reason as
-- `20260827090000_pull_request_review`: the generated form cannot express the
-- row deletion below, and running `prisma migrate dev` against a live database
-- risks a reset prompt on a schema that holds a Provider Key.
--
-- Deliberately ordered: the legacy Codebase Index rows are removed *before* the
-- column that identifies them is dropped. Afterwards there is no way to tell
-- them apart from rows the reviewer wrote.

-- Codebase Index rows written under the retired ownership model.
--
-- These cover the same files as the rows the reviewer wrote for the same
-- Repository, but were embedded from separately generated summaries. Left in
-- place they would be unreachable — search filters on `repositoryId` — and
-- re-pointing them at the Repository would put two vectors per file in the
-- index, so every semantic search would return each file twice.
--
-- The predicate requires both conditions so that a row owned by a Repository
-- can never be caught by it, whatever the legacy column happens to contain.
DELETE FROM "SourceCodeEmbedding"
WHERE "projectId" IS NOT NULL AND "repositoryId" IS NULL;

-- Legacy ownership on the surviving Codebase Index table.
ALTER TABLE "SourceCodeEmbedding" DROP CONSTRAINT "SourceCodeEmbedding_projectId_fkey";
ALTER TABLE "SourceCodeEmbedding" DROP COLUMN "projectId";

-- The retired ownership root and everything hanging off it. Children first so
-- that no drop depends on CASCADE to succeed.
DROP TABLE "MeetingIssue";
DROP TABLE "Meeting";
DROP TABLE "Question";
DROP TABLE "Commits";
DROP TABLE "UserToProject";
DROP TABLE "Project";

DROP TYPE "MeetingStatus";

-- Metering for the Q&A product. The reviewer is paid for by the Installation's
-- own Provider Key, so there is nothing on the review path to meter; the one
-- platform-funded cost is indexing, which is per Installation rather than per
-- user and would not use this column.
ALTER TABLE "User" DROP COLUMN "credits";

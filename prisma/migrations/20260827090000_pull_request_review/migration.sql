-- CreateEnum
CREATE TYPE "ReviewRunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "CriterionVerdict" AS ENUM ('satisfied', 'unsatisfied', 'unclear');

-- AlterTable: repository access now comes from a GitHub App installation token.
ALTER TABLE "Project" DROP COLUMN "githubToken";

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "githubInstallationId" BIGINT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "githubRepoId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "indexingStartedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3),

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceCriterion" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "issueNumber" INTEGER NOT NULL,
    "issueTitle" TEXT NOT NULL,
    "issueBodyHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcceptanceCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "pullRequestNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "commentId" BIGINT,
    "declinedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRun" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "status" "ReviewRunStatus" NOT NULL DEFAULT 'running',
    "model" TEXT,
    "costUsd" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionResult" (
    "id" TEXT NOT NULL,
    "reviewRunId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "verdict" "CriterionVerdict" NOT NULL,
    "evidence" TEXT NOT NULL,
    "evidenceFile" TEXT,
    "evidenceStartLine" INTEGER,
    "evidenceEndLine" INTEGER,

    CONSTRAINT "CriterionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "reviewRunId" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidenceFile" TEXT,
    "evidenceStartLine" INTEGER,
    "evidenceEndLine" INTEGER,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderKey" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Installation_githubInstallationId_key" ON "Installation"("githubInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubRepoId_key" ON "Repository"("githubRepoId");

-- CreateIndex
CREATE INDEX "Repository_installationId_idx" ON "Repository"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "AcceptanceCriterion_repositoryId_issueNumber_idx" ON "AcceptanceCriterion"("repositoryId", "issueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Review_repositoryId_pullRequestNumber_key" ON "Review"("repositoryId", "pullRequestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRun_reviewId_headSha_key" ON "ReviewRun"("reviewId", "headSha");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionResult_reviewRunId_criterionId_key" ON "CriterionResult"("reviewRunId", "criterionId");

-- CreateIndex
CREATE INDEX "Finding_reviewRunId_idx" ON "Finding"("reviewRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderKey_installationId_key" ON "ProviderKey"("installationId");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceCriterion" ADD CONSTRAINT "AcceptanceCriterion_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRun" ADD CONSTRAINT "ReviewRun_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "ReviewRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AcceptanceCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "ReviewRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderKey" ADD CONSTRAINT "ProviderKey_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: the Codebase Index is now owned by a Repository. `projectId` is
-- retained and made nullable until the Project purge lands.
ALTER TABLE "SourceCodeEmbedding" DROP CONSTRAINT "SourceCodeEmbedding_projectId_fkey";
ALTER TABLE "SourceCodeEmbedding" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "SourceCodeEmbedding" ADD COLUMN "repositoryId" TEXT;

-- CreateIndex
CREATE INDEX "SourceCodeEmbedding_repositoryId_idx" ON "SourceCodeEmbedding"("repositoryId");

-- AddForeignKey
ALTER TABLE "SourceCodeEmbedding" ADD CONSTRAINT "SourceCodeEmbedding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCodeEmbedding" ADD CONSTRAINT "SourceCodeEmbedding_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The exact scan does not survive contact with multiple indexed repositories.
-- HNSW over cosine distance, matching the `<=>` operator used by retrieval.
-- Cannot be expressed in the Prisma schema: the column is `Unsupported`.
CREATE INDEX IF NOT EXISTS "SourceCodeEmbedding_summaryEmbedding_hnsw_idx"
    ON "SourceCodeEmbedding"
    USING hnsw ("summaryEmbedding" vector_cosine_ops);

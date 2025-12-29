/*
  Warnings:

  - You are about to drop the column `summery` on the `SourceCodeEmbedding` table. All the data in the column will be lost.
  - You are about to drop the column `summeryEmbedding` on the `SourceCodeEmbedding` table. All the data in the column will be lost.
  - Added the required column `summary` to the `SourceCodeEmbedding` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SourceCodeEmbedding" DROP COLUMN "summery",
DROP COLUMN "summeryEmbedding",
ADD COLUMN     "summary" TEXT NOT NULL,
ADD COLUMN     "summaryEmbedding" vector(768);

-- CreateEnum
CREATE TYPE "RecoveredFileStatus" AS ENUM ('PENDING', 'PROMOTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "RecoveredFile" (
    "id" SERIAL NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbKey" TEXT,
    "thumbUrl" TEXT,
    "sizeBytes" INTEGER,
    "lastModifiedB2" TIMESTAMP(3),
    "status" "RecoveredFileStatus" NOT NULL DEFAULT 'PENDING',
    "hintTroupeId" INTEGER,
    "hintUploaderId" INTEGER,
    "hintAction" TEXT,
    "hintAuditAt" TIMESTAMP(3),
    "promotedSetId" INTEGER,
    "promotedAt" TIMESTAMP(3),
    "promotedById" INTEGER,
    "discardedAt" TIMESTAMP(3),
    "discardedById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveredFile_fileKey_key" ON "RecoveredFile"("fileKey");

-- CreateIndex
CREATE INDEX "RecoveredFile_status_idx" ON "RecoveredFile"("status");

-- CreateIndex
CREATE INDEX "RecoveredFile_hintTroupeId_idx" ON "RecoveredFile"("hintTroupeId");

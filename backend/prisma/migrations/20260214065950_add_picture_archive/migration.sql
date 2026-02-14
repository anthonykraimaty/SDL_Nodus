-- AlterTable
ALTER TABLE "Picture" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Picture_isArchived_idx" ON "Picture"("isArchived");

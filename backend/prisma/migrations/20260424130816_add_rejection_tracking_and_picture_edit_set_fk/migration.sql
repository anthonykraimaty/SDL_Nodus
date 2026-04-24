-- AlterTable
ALTER TABLE "PictureSet" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" INTEGER;

-- CreateIndex
CREATE INDEX "PictureSet_rejectedById_idx" ON "PictureSet"("rejectedById");

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureEdit" ADD CONSTRAINT "PictureEdit_pictureSetId_fkey" FOREIGN KEY ("pictureSetId") REFERENCES "PictureSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate existing REJECTED sets from approvedBy/approvedAt → rejectedBy/rejectedAt.
-- Prior to this migration, rejections (incorrectly) reused the approver columns.
UPDATE "PictureSet"
SET "rejectedById" = "approvedById",
    "rejectedAt"   = "approvedAt",
    "approvedById" = NULL,
    "approvedAt"   = NULL
WHERE "status" = 'REJECTED' AND "approvedById" IS NOT NULL;

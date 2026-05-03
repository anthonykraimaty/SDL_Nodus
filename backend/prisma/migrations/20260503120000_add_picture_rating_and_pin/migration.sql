-- AlterTable: add hidden rating + pinned curation fields
ALTER TABLE "Picture" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Picture" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Picture" ADD COLUMN "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Picture_rating_idx" ON "Picture"("rating");
CREATE INDEX "Picture_pinned_idx" ON "Picture"("pinned");

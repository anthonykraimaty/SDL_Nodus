-- AlterTable
ALTER TABLE "Picture" ADD COLUMN     "type" "PictureType";

-- CreateIndex
CREATE INDEX "Picture_type_idx" ON "Picture"("type");

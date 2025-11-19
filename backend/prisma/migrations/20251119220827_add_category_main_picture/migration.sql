-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "mainPictureId" INTEGER;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_mainPictureId_fkey" FOREIGN KEY ("mainPictureId") REFERENCES "Picture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

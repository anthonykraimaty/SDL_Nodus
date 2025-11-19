/*
  Warnings:

  - You are about to drop the column `thumbnailPath` on the `Picture` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Picture" DROP COLUMN "thumbnailPath",
ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "takenAt" TIMESTAMP(3);

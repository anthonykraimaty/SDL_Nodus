/*
  Warnings:

  - You are about to drop the column `approvedAt` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `approvedById` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `classifiedAt` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `classifiedById` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `isHighlight` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `patrouilleId` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `rejectionReason` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `subCategoryId` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `troupeId` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedById` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the column `viewCount` on the `Picture` table. All the data in the column will be lost.
  - You are about to drop the `_PictureToTag` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `pictureSetId` to the `Picture` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_classifiedById_fkey";

-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_patrouilleId_fkey";

-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_subCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_troupeId_fkey";

-- DropForeignKey
ALTER TABLE "Picture" DROP CONSTRAINT "Picture_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "_PictureToTag" DROP CONSTRAINT "_PictureToTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_PictureToTag" DROP CONSTRAINT "_PictureToTag_B_fkey";

-- DropIndex
DROP INDEX "Picture_categoryId_idx";

-- DropIndex
DROP INDEX "Picture_isHighlight_idx";

-- DropIndex
DROP INDEX "Picture_patrouilleId_idx";

-- DropIndex
DROP INDEX "Picture_status_idx";

-- DropIndex
DROP INDEX "Picture_subCategoryId_idx";

-- DropIndex
DROP INDEX "Picture_troupeId_idx";

-- DropIndex
DROP INDEX "Picture_type_idx";

-- DropIndex
DROP INDEX "Picture_uploadedAt_idx";

-- DropIndex
DROP INDEX "Picture_uploadedById_idx";

-- AlterTable
ALTER TABLE "Picture" DROP COLUMN "approvedAt",
DROP COLUMN "approvedById",
DROP COLUMN "categoryId",
DROP COLUMN "classifiedAt",
DROP COLUMN "classifiedById",
DROP COLUMN "description",
DROP COLUMN "isHighlight",
DROP COLUMN "latitude",
DROP COLUMN "location",
DROP COLUMN "longitude",
DROP COLUMN "patrouilleId",
DROP COLUMN "rejectionReason",
DROP COLUMN "status",
DROP COLUMN "subCategoryId",
DROP COLUMN "title",
DROP COLUMN "troupeId",
DROP COLUMN "type",
DROP COLUMN "uploadedById",
DROP COLUMN "viewCount",
ADD COLUMN     "caption" TEXT,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pictureSetId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "_PictureToTag";

-- CreateTable
CREATE TABLE "PictureSet" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "PictureType" NOT NULL,
    "status" "PictureStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" INTEGER NOT NULL,
    "troupeId" INTEGER NOT NULL,
    "patrouilleId" INTEGER,
    "categoryId" INTEGER,
    "subCategoryId" INTEGER,
    "classifiedById" INTEGER,
    "classifiedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isHighlight" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PictureSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PictureSetToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PictureSetToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PictureSet_uploadedById_idx" ON "PictureSet"("uploadedById");

-- CreateIndex
CREATE INDEX "PictureSet_troupeId_idx" ON "PictureSet"("troupeId");

-- CreateIndex
CREATE INDEX "PictureSet_patrouilleId_idx" ON "PictureSet"("patrouilleId");

-- CreateIndex
CREATE INDEX "PictureSet_categoryId_idx" ON "PictureSet"("categoryId");

-- CreateIndex
CREATE INDEX "PictureSet_subCategoryId_idx" ON "PictureSet"("subCategoryId");

-- CreateIndex
CREATE INDEX "PictureSet_status_idx" ON "PictureSet"("status");

-- CreateIndex
CREATE INDEX "PictureSet_type_idx" ON "PictureSet"("type");

-- CreateIndex
CREATE INDEX "PictureSet_isHighlight_idx" ON "PictureSet"("isHighlight");

-- CreateIndex
CREATE INDEX "PictureSet_uploadedAt_idx" ON "PictureSet"("uploadedAt");

-- CreateIndex
CREATE INDEX "_PictureSetToTag_B_index" ON "_PictureSetToTag"("B");

-- CreateIndex
CREATE INDEX "Picture_pictureSetId_idx" ON "Picture"("pictureSetId");

-- CreateIndex
CREATE INDEX "Picture_displayOrder_idx" ON "Picture"("displayOrder");

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_troupeId_fkey" FOREIGN KEY ("troupeId") REFERENCES "Troupe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_patrouilleId_fkey" FOREIGN KEY ("patrouilleId") REFERENCES "Patrouille"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_classifiedById_fkey" FOREIGN KEY ("classifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_pictureSetId_fkey" FOREIGN KEY ("pictureSetId") REFERENCES "PictureSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PictureSetToTag" ADD CONSTRAINT "_PictureSetToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "PictureSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PictureSetToTag" ADD CONSTRAINT "_PictureSetToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

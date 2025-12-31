-- CreateEnum
CREATE TYPE "SchematicStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PictureSet" ADD COLUMN     "imageHash" TEXT,
ADD COLUMN     "schematicCategoryId" INTEGER;

-- CreateTable
CREATE TABLE "SchematicCategory" (
    "id" SERIAL NOT NULL,
    "setName" TEXT NOT NULL,
    "setOrder" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchematicCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchematicProgress" (
    "id" SERIAL NOT NULL,
    "patrouilleId" INTEGER NOT NULL,
    "schematicCategoryId" INTEGER NOT NULL,
    "status" "SchematicStatus" NOT NULL DEFAULT 'PENDING',
    "pictureSetId" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchematicProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchematicCategory_setName_idx" ON "SchematicCategory"("setName");

-- CreateIndex
CREATE INDEX "SchematicCategory_setOrder_itemOrder_idx" ON "SchematicCategory"("setOrder", "itemOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SchematicCategory_setName_itemName_key" ON "SchematicCategory"("setName", "itemName");

-- CreateIndex
CREATE INDEX "SchematicProgress_patrouilleId_idx" ON "SchematicProgress"("patrouilleId");

-- CreateIndex
CREATE INDEX "SchematicProgress_schematicCategoryId_idx" ON "SchematicProgress"("schematicCategoryId");

-- CreateIndex
CREATE INDEX "SchematicProgress_status_idx" ON "SchematicProgress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SchematicProgress_patrouilleId_schematicCategoryId_key" ON "SchematicProgress"("patrouilleId", "schematicCategoryId");

-- CreateIndex
CREATE INDEX "PictureSet_schematicCategoryId_idx" ON "PictureSet"("schematicCategoryId");

-- CreateIndex
CREATE INDEX "PictureSet_imageHash_idx" ON "PictureSet"("imageHash");

-- AddForeignKey
ALTER TABLE "PictureSet" ADD CONSTRAINT "PictureSet_schematicCategoryId_fkey" FOREIGN KEY ("schematicCategoryId") REFERENCES "SchematicCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchematicProgress" ADD CONSTRAINT "SchematicProgress_patrouilleId_fkey" FOREIGN KEY ("patrouilleId") REFERENCES "Patrouille"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchematicProgress" ADD CONSTRAINT "SchematicProgress_schematicCategoryId_fkey" FOREIGN KEY ("schematicCategoryId") REFERENCES "SchematicCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchematicProgress" ADD CONSTRAINT "SchematicProgress_pictureSetId_fkey" FOREIGN KEY ("pictureSetId") REFERENCES "PictureSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

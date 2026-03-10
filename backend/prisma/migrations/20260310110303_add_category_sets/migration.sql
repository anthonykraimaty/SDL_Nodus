-- CreateTable
CREATE TABLE "CategorySet" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySetItem" (
    "id" SERIAL NOT NULL,
    "categorySetId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryProgress" (
    "id" SERIAL NOT NULL,
    "patrouilleId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "status" "SchematicStatus" NOT NULL DEFAULT 'PENDING',
    "pictureSetId" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategorySet_name_key" ON "CategorySet"("name");

-- CreateIndex
CREATE INDEX "CategorySetItem_categorySetId_idx" ON "CategorySetItem"("categorySetId");

-- CreateIndex
CREATE INDEX "CategorySetItem_categoryId_idx" ON "CategorySetItem"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySetItem_categorySetId_categoryId_key" ON "CategorySetItem"("categorySetId", "categoryId");

-- CreateIndex
CREATE INDEX "CategoryProgress_patrouilleId_idx" ON "CategoryProgress"("patrouilleId");

-- CreateIndex
CREATE INDEX "CategoryProgress_categoryId_idx" ON "CategoryProgress"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryProgress_status_idx" ON "CategoryProgress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryProgress_patrouilleId_categoryId_key" ON "CategoryProgress"("patrouilleId", "categoryId");

-- AddForeignKey
ALTER TABLE "CategorySetItem" ADD CONSTRAINT "CategorySetItem_categorySetId_fkey" FOREIGN KEY ("categorySetId") REFERENCES "CategorySet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySetItem" ADD CONSTRAINT "CategorySetItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProgress" ADD CONSTRAINT "CategoryProgress_patrouilleId_fkey" FOREIGN KEY ("patrouilleId") REFERENCES "Patrouille"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProgress" ADD CONSTRAINT "CategoryProgress_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProgress" ADD CONSTRAINT "CategoryProgress_pictureSetId_fkey" FOREIGN KEY ("pictureSetId") REFERENCES "PictureSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

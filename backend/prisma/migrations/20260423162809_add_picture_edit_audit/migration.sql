-- CreateTable
CREATE TABLE "PictureEdit" (
    "id" SERIAL NOT NULL,
    "pictureId" INTEGER NOT NULL,
    "pictureSetId" INTEGER NOT NULL,
    "editedById" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editType" TEXT,
    "pictureSetStatusAtEdit" "PictureStatus" NOT NULL,

    CONSTRAINT "PictureEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PictureEdit_pictureId_idx" ON "PictureEdit"("pictureId");

-- CreateIndex
CREATE INDEX "PictureEdit_pictureSetId_idx" ON "PictureEdit"("pictureSetId");

-- CreateIndex
CREATE INDEX "PictureEdit_editedById_idx" ON "PictureEdit"("editedById");

-- CreateIndex
CREATE INDEX "PictureEdit_editedAt_idx" ON "PictureEdit"("editedAt");

-- CreateIndex
CREATE INDEX "PictureEdit_pictureSetStatusAtEdit_idx" ON "PictureEdit"("pictureSetStatusAtEdit");

-- AddForeignKey
ALTER TABLE "PictureEdit" ADD CONSTRAINT "PictureEdit_pictureId_fkey" FOREIGN KEY ("pictureId") REFERENCES "Picture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureEdit" ADD CONSTRAINT "PictureEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

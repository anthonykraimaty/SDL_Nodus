-- CreateTable
CREATE TABLE "PictureAudit" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "pictureId" INTEGER,
    "pictureSetId" INTEGER,
    "uploaderId" INTEGER,
    "troupeId" INTEGER,
    "actorId" INTEGER,
    "actorRole" "UserRole",
    "pictureSetStatusAtAction" "PictureStatus",
    "filePath" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PictureAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PictureAudit_pictureId_idx" ON "PictureAudit"("pictureId");

-- CreateIndex
CREATE INDEX "PictureAudit_pictureSetId_idx" ON "PictureAudit"("pictureSetId");

-- CreateIndex
CREATE INDEX "PictureAudit_uploaderId_idx" ON "PictureAudit"("uploaderId");

-- CreateIndex
CREATE INDEX "PictureAudit_troupeId_idx" ON "PictureAudit"("troupeId");

-- CreateIndex
CREATE INDEX "PictureAudit_actorId_idx" ON "PictureAudit"("actorId");

-- CreateIndex
CREATE INDEX "PictureAudit_action_idx" ON "PictureAudit"("action");

-- CreateIndex
CREATE INDEX "PictureAudit_createdAt_idx" ON "PictureAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "PictureAudit" ADD CONSTRAINT "PictureAudit_pictureId_fkey" FOREIGN KEY ("pictureId") REFERENCES "Picture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureAudit" ADD CONSTRAINT "PictureAudit_pictureSetId_fkey" FOREIGN KEY ("pictureSetId") REFERENCES "PictureSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PictureAudit" ADD CONSTRAINT "PictureAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

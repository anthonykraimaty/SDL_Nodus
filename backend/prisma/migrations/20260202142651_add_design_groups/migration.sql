-- AlterTable
ALTER TABLE "Picture" ADD COLUMN     "designGroupId" INTEGER;

-- CreateTable
CREATE TABLE "DesignGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "primaryPictureId" INTEGER,
    "categoryId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignGroup_categoryId_idx" ON "DesignGroup"("categoryId");

-- CreateIndex
CREATE INDEX "DesignGroup_createdById_idx" ON "DesignGroup"("createdById");

-- CreateIndex
CREATE INDEX "Picture_designGroupId_idx" ON "Picture"("designGroupId");

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_designGroupId_fkey" FOREIGN KEY ("designGroupId") REFERENCES "DesignGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignGroup" ADD CONSTRAINT "DesignGroup_primaryPictureId_fkey" FOREIGN KEY ("primaryPictureId") REFERENCES "Picture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignGroup" ADD CONSTRAINT "DesignGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignGroup" ADD CONSTRAINT "DesignGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

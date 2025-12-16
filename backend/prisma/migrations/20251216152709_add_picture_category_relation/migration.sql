-- CreateIndex
CREATE INDEX "Picture_categoryId_idx" ON "Picture"("categoryId");

-- AddForeignKey
ALTER TABLE "Picture" ADD CONSTRAINT "Picture_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "UserDistrictAccess" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "districtId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDistrictAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDistrictAccess_userId_idx" ON "UserDistrictAccess"("userId");

-- CreateIndex
CREATE INDEX "UserDistrictAccess_districtId_idx" ON "UserDistrictAccess"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDistrictAccess_userId_districtId_key" ON "UserDistrictAccess"("userId", "districtId");

-- AddForeignKey
ALTER TABLE "UserDistrictAccess" ADD CONSTRAINT "UserDistrictAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDistrictAccess" ADD CONSTRAINT "UserDistrictAccess_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

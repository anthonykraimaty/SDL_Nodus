-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isHiddenFromBrowse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isUploadDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Deleting a user must never delete the photos they uploaded.
--
-- PictureSet.uploadedById was ON DELETE CASCADE, so removing one chief
-- destroyed every picture set they had ever uploaded — up to 179 sets for a
-- single account on the live data, with 65 accounts exposed. Every other
-- actor column on PictureSet (approvedById, rejectedById, classifiedById) was
-- already SET NULL; the uploader was the odd one out.
--
-- The photos belong to the troupe and the camps they document, not to the
-- account that happened to upload them. uploaderEmail keeps the attribution
-- readable after the account is gone.

-- Snapshot the uploader's email BEFORE making the link breakable, so existing
-- sets keep their provenance.
ALTER TABLE "PictureSet" ADD COLUMN "uploaderEmail" TEXT;

UPDATE "PictureSet" ps
SET "uploaderEmail" = u."email"
FROM "User" u
WHERE ps."uploadedById" = u."id";

-- Allow the link to be broken rather than cascading.
ALTER TABLE "PictureSet" ALTER COLUMN "uploadedById" DROP NOT NULL;

ALTER TABLE "PictureSet" DROP CONSTRAINT "PictureSet_uploadedById_fkey";
ALTER TABLE "PictureSet"
  ADD CONSTRAINT "PictureSet_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Same reasoning for a curated design group.
ALTER TABLE "DesignGroup" ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "DesignGroup" DROP CONSTRAINT "DesignGroup_createdById_fkey";
ALTER TABLE "DesignGroup"
  ADD CONSTRAINT "DesignGroup_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

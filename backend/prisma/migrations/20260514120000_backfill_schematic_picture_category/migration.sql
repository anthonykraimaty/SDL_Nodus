-- Backfill Picture.type and Picture.categoryId for schematics uploaded via
-- /api/schematics/upload.
--
-- The schematic upload + classify flow updated PictureSet.categoryId but never
-- wrote categoryId/type onto the child Picture rows. /api/categories/:id/pictures
-- filters by Picture.categoryId and Picture.type (per-picture, not per-set), so
-- approved schematics were silently invisible under the explorer's category
-- pages even though Schematic Progress marked them as DONE.
--
-- The upload and classify routes were patched in src/routes/schematics.js so new
-- writes carry these fields. This migration repairs existing rows. It is
-- idempotent: re-running on already-fixed data is a no-op.

BEGIN;

UPDATE "Picture" p
SET
  "type" = 'SCHEMATIC',
  "categoryId" = ps."categoryId"
FROM "PictureSet" ps
WHERE p."pictureSetId" = ps.id
  AND ps."type" = 'SCHEMATIC'
  AND ps."categoryId" IS NOT NULL
  AND (
    p."type" IS DISTINCT FROM 'SCHEMATIC'
    OR p."categoryId" IS DISTINCT FROM ps."categoryId"
  );

COMMIT;

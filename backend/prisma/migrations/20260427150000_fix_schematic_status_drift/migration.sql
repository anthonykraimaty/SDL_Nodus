-- Fix schematic status drift introduced by the unified /api/pictures/:id/classify
-- and /api/pictures/:id/classify-bulk endpoints. Those endpoints used to flip
-- SCHEMATIC sets to status='CLASSIFIED', but the schematic review queue and
-- approval routes only act on status='PENDING'. As a result, schematics that
-- had been classified through that path were invisible to reviewers and
-- impossible to approve through the normal flow.
--
-- This migration repairs the data:
--   1. Re-flag review-queue schematics from CLASSIFIED back to PENDING.
--   2. Drop orphan CategoryProgress rows whose underlying PictureSet was
--      deleted (pictureSetId IS NULL while status=SUBMITTED). These inflate
--      the per-patrouille `pendingReview` count on /progress endpoints.
--
-- The endpoint logic itself was patched in src/routes/pictures.js so new
-- writes will not reintroduce the drift. This migration is idempotent: if it
-- runs on a clean database it simply finds nothing to update or delete.

BEGIN;

-- 1. Schematics stuck in CLASSIFIED that were never approved or rejected, and
--    whose category belongs to a CategorySet (i.e. winner-track schematics —
--    the only ones the review queue cares about). These should be PENDING.
UPDATE "PictureSet"
SET status = 'PENDING'
WHERE type = 'SCHEMATIC'
  AND status = 'CLASSIFIED'
  AND "approvedById" IS NULL
  AND "rejectedById" IS NULL
  AND "categoryId" IN (SELECT "categoryId" FROM "CategorySetItem");

-- 2. Orphan SUBMITTED progress rows. status=SUBMITTED is supposed to point at
--    the PictureSet currently in review; a NULL pictureSetId here means the
--    set was deleted but the progress row leaked.
DELETE FROM "CategoryProgress"
WHERE status = 'SUBMITTED'
  AND "pictureSetId" IS NULL;

COMMIT;

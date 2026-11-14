-- Keep the organisational structure in step with Inscription WITHOUT ever
-- destroying history.
--
-- Two separate problems are fixed here.
--
-- 1. Soft delete. A group or unit that leaves Inscription (a group that folds,
--    a troupe that merges) must not take its photos with it. Rows are now
--    DEACTIVATED (isActive = false), never deleted — the same model SEVA uses.
--
-- 2. The cascade chain. District -> Group -> Troupe -> PictureSet was a full
--    ON DELETE CASCADE, so deleting ONE group silently destroyed every picture
--    set of its troupes (measured: one group = 5 sets, 55 pictures). Troupe is
--    now RESTRICT-ed from Group, and PictureSet from Troupe, so the database
--    itself refuses any delete that would drop pictures. Soft delete is the
--    supported path; a hard delete is only possible once a row is genuinely
--    empty.

-- --- 1. soft-delete columns -------------------------------------------------

ALTER TABLE "District"
  ADD COLUMN "isActive"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

ALTER TABLE "Group"
  ADD COLUMN "isActive"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

ALTER TABLE "Troupe"
  ADD COLUMN "isActive"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE INDEX "Group_isActive_idx"  ON "Group"("isActive");
CREATE INDEX "Troupe_isActive_idx" ON "Troupe"("isActive");

-- --- 2. stop deletes from reaching the pictures -----------------------------

-- Group -> District: deleting a district must not wipe its groups.
ALTER TABLE "Group" DROP CONSTRAINT "Group_districtId_fkey";
ALTER TABLE "Group"
  ADD CONSTRAINT "Group_districtId_fkey"
  FOREIGN KEY ("districtId") REFERENCES "District"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Troupe -> Group: this is the one that destroyed picture sets.
ALTER TABLE "Troupe" DROP CONSTRAINT "Troupe_groupId_fkey";
ALTER TABLE "Troupe"
  ADD CONSTRAINT "Troupe_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- PictureSet -> Troupe: the last line of defence for the photos themselves.
ALTER TABLE "PictureSet" DROP CONSTRAINT "PictureSet_troupeId_fkey";
ALTER TABLE "PictureSet"
  ADD CONSTRAINT "PictureSet_troupeId_fkey"
  FOREIGN KEY ("troupeId") REFERENCES "Troupe"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Patrouille -> Troupe: patrouilles carry schematic/category progress history.
ALTER TABLE "Patrouille" DROP CONSTRAINT "Patrouille_troupeId_fkey";
ALTER TABLE "Patrouille"
  ADD CONSTRAINT "Patrouille_troupeId_fkey"
  FOREIGN KEY ("troupeId") REFERENCES "Troupe"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

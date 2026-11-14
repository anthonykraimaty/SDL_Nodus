-- Keycloak (Scouts du Liban account) sign-in.
--
-- Safe on existing data:
--   * User.password becomes nullable; every existing row keeps its hash and so
--     keeps working on the password form.
--   * provider defaults to LOCAL, so existing accounts are unchanged.
--   * Troupe.branche defaults to 'Eclaireurs' — nodus only held Eclaireurs
--     units until now, and an empty User.branches means "every branche", so no
--     existing reviewer loses access.

-- How an account signs in.
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'KEYCLOAK');

-- A Keycloak account has no nodus password of its own.
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

ALTER TABLE "User"
  ADD COLUMN "keycloakSub"    TEXT,
  ADD COLUMN "provider"       "AuthProvider" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "username"       TEXT,
  ADD COLUMN "realmRoles"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "clientRoles"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "keycloakGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "branches"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "inscription"    JSONB;

CREATE UNIQUE INDEX "User_keycloakSub_key" ON "User"("keycloakSub");

-- Inscription (QG) ids, so a Keycloak sign-in can map a chief onto nodus rows.
ALTER TABLE "District" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Group"    ADD COLUMN "externalId" TEXT;
ALTER TABLE "Troupe"   ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "District_externalId_key" ON "District"("externalId");
CREATE UNIQUE INDEX "Group_externalId_key"    ON "Group"("externalId");
CREATE UNIQUE INDEX "Troupe_externalId_key"   ON "Troupe"("externalId");

-- Which branche a unit belongs to. Decides which Branche team may approve it.
ALTER TABLE "Troupe" ADD COLUMN "branche" TEXT NOT NULL DEFAULT 'Eclaireurs';
CREATE INDEX "Troupe_branche_idx" ON "Troupe"("branche");

-- District.externalId is the Inscription district id; nodus districts came from
-- the same source (suivi2025) with identical codes, so it can be set now.
UPDATE "District" SET "externalId" = v.ext FROM (VALUES
  ('BEK','1'),('BEY1','2'),('BEY2','3'),('LN1','4'),('LN2','5'),('LN3','6'),
  ('LS','7'),('ML1','8'),('ML2','9'),('ML3','10'),('ML4','11'),('ML5','12'),
  ('ML6','13'),('ML7','14'),('ML8','15')
) AS v(code, ext) WHERE "District"."code" = v.code;

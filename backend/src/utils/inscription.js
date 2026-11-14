// The federation's Inscription API (QG) — who a signed-in chief is, and which
// troupe they lead. Server-only.
//
// GET /Profile is "me": called once, at Keycloak sign-in, with the chief's own
// access token (same QG_CMS realm). Nodus keeps the answer on the User
// (`inscription`), never the token.
//
// The answer carries `groupRoles`: one entry per role the chief holds, with the
// Inscription unit id / name, group id / name and the role abbreviation (CU =
// chef d'unité, ACU = assistant). That is what links them to a nodus Troupe.

import { PrismaClient } from '@prisma/client';
import { inscription as cfg, keycloak } from '../config/keycloak.js';
import { BRANCHES } from './keycloakAccess.js';

const prisma = new PrismaClient();

async function call(path, token) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Language': 'fr',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = new Error(`Inscription a répondu ${res.status} sur ${path.split('?')[0]}`);
    err.httpStatus = res.status;
    throw err;
  }
  return res.json();
}

/**
 * The signed-in chief's profile, read with their own access token right after
 * sign-in. Never throws: null when the API is down or refuses the token (the
 * previously stored value is then kept).
 */
export async function fetchProfile(accessToken) {
  try {
    const p = await call('/Profile', accessToken);
    return {
      memberId: Number(p?.memberId) || null,
      roles: (p?.groupRoles || []).map((r) => ({
        abbr: String(r.roleAbbreviation || ''),
        name: String(r.roleName || ''),
        unitId: Number(r.unitId) || null,
        unitName: String(r.unitName || ''),
        groupId: Number(r.groupId) || null,
        groupName: String(r.groupName || ''),
        branche: String(r.brancheName || r.branchName || ''),
        unitRole: !!r.isUnitRole,
      })),
      at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[inscription] profile not read at sign-in:', err.message);
    return null;
  }
}

// Roles that actually run a unit, best first. A CU outranks an ACU when a
// chief holds roles in several units, so the unit they *lead* wins over one
// they merely assist in.
const RANK = { CU: 0, CT: 0, ACU: 1, ACT: 1 };

/**
 * The Inscription unit roles of a profile that could be a nodus troupe, best
 * first. Group-staff ("maîtrise") lines carry no unit and are dropped.
 *
 * Nodus only holds scout units (troupes). A chief who is also CU of a meute
 * must not be linked to a "troupe" that is really a Louveteaux pack, so roles
 * whose branche is known and is not one Nodus tracks are dropped. A role with
 * no branche information is kept — the name match inside the right group is
 * then what decides.
 */
export function unitRoles(profile, { branches = null } = {}) {
  return (profile?.roles || [])
    .filter((r) => r.unitId && r.unitName)
    .filter((r) => {
      if (!branches || !r.branche) return true;
      return branches.includes(r.branche);
    })
    .sort((a, b) => (RANK[a.abbr] ?? 9) - (RANK[b.abbr] ?? 9));
}

/** Same name, ignoring case, accents, punctuation and double spaces. */
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Find the nodus Troupe a chief leads, from their Inscription profile.
 *
 * Matched in order, best role first:
 *   1. Troupe.externalId === the Inscription unit id — exact, and the only
 *      match that is trusted blindly;
 *   2. the unit name, but ONLY inside the group identified by its Inscription
 *      id or name, and only when exactly one troupe there bears that name.
 *
 * Deliberately conservative. A wrong link is worse than no link: it would let
 * a chief upload into someone else's troupe and show them that troupe's
 * pictures. Anything ambiguous returns null and the chief is told to contact
 * their commissaire.
 *
 * Returns { troupe, matchedBy, role } or null.
 */
export async function findTroupeForProfile(profile, { branches = null } = {}) {
  for (const role of unitRoles(profile, { branches })) {
    const unitId = String(role.unitId);

    // 1. Exact Inscription unit id.
    const byId = await prisma.troupe.findFirst({ where: { externalId: unitId } });
    if (byId) return { troupe: byId, matchedBy: 'externalId', role };

    // 2. Name, but only within the chief's own group. Matching a unit name
    //    across all groups would be dangerous: "Troupe 1ère" exists in many
    //    groups, so a global name match links people to strangers' troupes.
    const groupExtId = role.groupId ? String(role.groupId) : null;
    let group = groupExtId
      ? await prisma.group.findFirst({ where: { externalId: groupExtId } })
      : null;

    if (!group && role.groupName) {
      // Fall back to the group's name — but only if it is unambiguous.
      const sameName = (await prisma.group.findMany()).filter(
        (g) => norm(g.name) === norm(role.groupName)
      );
      if (sameName.length === 1) {
        group = sameName[0];
        // Remember the Inscription id so the next sign-in is a direct hit.
        if (groupExtId && !group.externalId) {
          await prisma.group
            .update({ where: { id: group.id }, data: { externalId: groupExtId } })
            .catch(() => {}); // a racing sign-in may have set it first
        }
      } else if (sameName.length > 1) {
        console.warn(
          `[inscription] group name "${role.groupName}" is ambiguous in nodus (${sameName.length} matches) — not linking`
        );
      }
    }

    // Without a group we cannot match a unit name safely. Give up on this role.
    if (!group) continue;

    const sameUnit = (
      await prisma.troupe.findMany({ where: { groupId: group.id } })
    ).filter((t) => norm(t.name) === norm(role.unitName));

    if (sameUnit.length === 1) {
      const troupe = sameUnit[0];
      if (!troupe.externalId) {
        await prisma.troupe
          .update({ where: { id: troupe.id }, data: { externalId: unitId } })
          .catch(() => {});
      }
      return { troupe, matchedBy: 'name', role };
    }
    if (sameUnit.length > 1) {
      console.warn(
        `[inscription] unit "${role.unitName}" is ambiguous in group "${group.name}" — not linking`
      );
    }
  }
  return null;
}

/**
 * Link a Keycloak user to their troupe from their Inscription profile.
 * Only ever *sets* a troupe: an assignment an admin made by hand is never
 * overwritten, and a chief is never detached because Inscription was down.
 * Returns the troupeId in force, or null.
 */
export async function autoLinkTroupe(user, profile) {
  if (!cfg.autoLinkTroupe) return user.troupeId ?? null;
  if (user.troupeId) return user.troupeId; // already assigned — leave it alone
  if (!profile) return null;

  // Only ever link to a branche Nodus actually tracks, so a chief who leads a
  // meute as well as a troupe is linked to the troupe.
  const match = await findTroupeForProfile(profile, { branches: BRANCHES });
  if (!match) {
    const tried = unitRoles(profile, { branches: BRANCHES })
      .map((r) => `${r.unitName} (${r.abbr || '?'})`)
      .join(', ');
    console.warn(
      `[inscription] ${user.email}: no nodus troupe matched${tried ? ` — Inscription says: ${tried}` : ' (no unit role in a tracked branche)'}`
    );
    return null;
  }

  // A deactivated troupe is history, not a destination: its pictures stay
  // browsable but nobody new is attached to it.
  if (match.troupe.isActive === false) {
    console.warn(
      `[inscription] ${user.email}: matched troupe "${match.troupe.name}" is deactivated — not linking`
    );
    return null;
  }

  console.log(
    `[inscription] ${user.email} linked to troupe "${match.troupe.name}" (#${match.troupe.id}) by ${match.matchedBy}`
  );
  return match.troupe.id;
}

/**
 * The district codes an Inscription profile covers, for a branche member whose
 * rule does not pin districts explicitly. Read from the unit roles' district
 * when the API exposes it; empty otherwise (= every district).
 */
export function profileDistrictCodes(profile) {
  return [
    ...new Set(
      (profile?.roles || [])
        .map((r) => String(r.districtAbbreviation || r.districtCode || '').toUpperCase())
        .filter(Boolean)
    ),
  ];
}

/** Is the Inscription integration usable at all? */
export const inscriptionEnabled = () => keycloak.enabled && !!cfg.baseUrl;

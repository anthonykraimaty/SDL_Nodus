// Who may sign in to Nodus, who may approve, and for which branche.
//
// Two sources, added together:
//   - the environment (KEYCLOAK_LOGIN_ROLES / APPROVE_ROLES / CHEF_ROLES /
//     ADMIN_ROLES) — pins a server by configuration and can never be removed
//     from the admin page, so nobody can lock themselves out;
//   - the `keycloakAccess` row of SystemSetting, edited on Admin → Accès,
//     which maps Keycloak groups / realm roles onto a nodus role, a branche
//     and (for approvers) a set of districts — without a redeploy.
//
// A rule entry is one of:
//   "admin"        a role on nodus's own Keycloak client
//   "realm:Name"   a realm role
//   "/Group"       membership of that group, or of one of its subgroups
//
// The resulting nodus role is the highest one the account qualifies for:
//   ADMIN > BRANCHE_ECLAIREURS > CHEF_TROUPE.

import { PrismaClient } from '@prisma/client';
import { keycloak } from '../config/keycloak.js';

const prisma = new PrismaClient();

const SETTING_KEY = 'keycloakAccess';

// The branches of the federation, as Inscription/Keycloak name them. A Branche
// member is scoped to one or more of these; an empty list means every branche
// (the pre-Keycloak behaviour, kept for legacy accounts).
export const BRANCHES = [
  'Eclaireurs',
  'Eclaireuses',
  'Louveteaux',
  'Louvettes',
  'Route',
  'Pionnières',
];

export const DEFAULT_ACCESS = {
  // Who may sign in. everyone:true = any account of the realm.
  login: { everyone: true, groups: [], realmRoles: [] },
  // Who becomes an ADMIN.
  admin: { groups: [], realmRoles: [] },
  // Who becomes a BRANCHE_ECLAIREURS (an approver), and for which branche /
  // districts. One entry per rule so Eclaireurs and Eclaireuses can be
  // approved by different teams.
  //   { match: "/QG_Eclaireurs", branches: ["Eclaireurs"], districts: ["ML3"] }
  // districts: [] means every district (a national branche team).
  approvers: [],
  // Who becomes a CHEF_TROUPE (may upload for their troupe).
  chefs: { groups: [], realmRoles: [] },
};

// --- normalisation ----------------------------------------------------------

const strList = (v, max = 100) =>
  (Array.isArray(v) ? v : [])
    .map((s) => String(s ?? '').trim().slice(0, 120))
    .filter(Boolean)
    .filter((s, i, a) => a.indexOf(s) === i)
    .slice(0, max);

const brancheList = (v) => strList(v).filter((b) => BRANCHES.includes(b));

export function cleanAccessSettings(body) {
  return {
    login: {
      everyone: body?.login?.everyone !== false,
      groups: strList(body?.login?.groups),
      realmRoles: strList(body?.login?.realmRoles),
    },
    admin: {
      groups: strList(body?.admin?.groups),
      realmRoles: strList(body?.admin?.realmRoles),
    },
    approvers: (Array.isArray(body?.approvers) ? body.approvers : [])
      .map((r) => ({
        match: String(r?.match ?? '').trim().slice(0, 120),
        branches: brancheList(r?.branches),
        // District codes (BEK, ML3…). Empty = every district.
        districts: strList(r?.districts, 30).map((d) => d.toUpperCase()),
      }))
      .filter((r) => r.match)
      .slice(0, 100),
    chefs: {
      groups: strList(body?.chefs?.groups),
      realmRoles: strList(body?.chefs?.realmRoles),
    },
  };
}

export async function getAccessSettings() {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return structuredClone(DEFAULT_ACCESS);
  try {
    return cleanAccessSettings(JSON.parse(row.value));
  } catch {
    return structuredClone(DEFAULT_ACCESS);
  }
}

export async function saveAccessSettings(body, userId = null) {
  const value = cleanAccessSettings(body);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(value), updatedById: userId },
    create: { key: SETTING_KEY, value: JSON.stringify(value), updatedById: userId },
  });
  return value;
}

// --- matching ---------------------------------------------------------------

const normGroup = (g) => String(g || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');

/** "CU" matches "/CU" and "/CU/anything"; a rule never matches an empty name. */
export function groupMatches(wanted, actual) {
  const w = normGroup(wanted);
  const a = normGroup(actual);
  return !!w && (a === w || a.startsWith(`${w}/`));
}

/**
 * True when the identity holds any one of `entries`:
 *   "admin"        role on nodus's own Keycloak client
 *   "realm:Name"   realm role
 *   "/Group"       group membership (or a subgroup of it)
 */
export function holdsAny(identity, entries) {
  return [].concat(entries || []).some((entry) => {
    if (entry.startsWith('/')) {
      return (identity.groups || []).some((g) => groupMatches(entry, g));
    }
    if (entry.startsWith('realm:')) {
      return (identity.realmRoles || []).includes(entry.slice(6));
    }
    return (identity.clientRoles || []).includes(entry);
  });
}

/** Group / realm-role rules of a settings block as `holdsAny` entries. */
const entriesOf = ({ groups = [], realmRoles = [] } = {}) => [
  ...groups.map((g) => (g.startsWith('/') ? g : `/${g}`)),
  ...realmRoles.map((r) => `realm:${r}`),
];

/**
 * What a Keycloak identity becomes in nodus.
 *
 * Returns:
 *   { allowed, role, isAdmin, branches, districtCodes, reason }
 *
 *   allowed        false → refuse the sign-in, create nothing
 *   role           'ADMIN' | 'BRANCHE_ECLAIREURS' | 'CHEF_TROUPE' | null
 *                  null = may sign in but holds no nodus role yet (an admin
 *                  then assigns one from Admin → Utilisateurs)
 *   branches       for an approver: which branches they review. [] = all.
 *   districtCodes  for an approver: which districts. [] = all.
 */
export async function resolveAccess(identity, settings = null) {
  const access = settings || (await getAccessSettings());

  const adminEntries = [...keycloak.adminRoles, ...entriesOf(access.admin)];
  const chefEntries = [...keycloak.chefRoles, ...entriesOf(access.chefs)];
  const loginEntries = [...keycloak.loginRoles, ...entriesOf(access.login)];
  // The env list, when set, closes the door even if the page says "everyone".
  const loginEveryone = access.login.everyone && keycloak.loginRoles.length === 0;

  const isAdmin = holdsAny(identity, adminEntries);

  // Every approver rule the account matches, merged: a member of two branche
  // teams reviews both.
  const matched = (access.approvers || []).filter((r) => holdsAny(identity, [r.match]));
  // KEYCLOAK_APPROVE_ROLES from the env grants approval over every branche.
  const envApprover = keycloak.approveRoles.length > 0 && holdsAny(identity, keycloak.approveRoles);
  const isApprover = matched.length > 0 || envApprover;

  const branches = envApprover
    ? [] // env approvers are national, every branche
    : [...new Set(matched.flatMap((r) => r.branches))];
  const districtCodes = envApprover
    ? []
    : // One rule with no district restriction opens every district.
      matched.some((r) => r.districts.length === 0)
      ? []
      : [...new Set(matched.flatMap((r) => r.districts))];

  const isChef = holdsAny(identity, chefEntries);

  // Admins always get in, whatever the login rules say.
  if (!loginEveryone && !isAdmin && !isApprover && !isChef && !holdsAny(identity, loginEntries)) {
    return {
      allowed: false,
      role: null,
      isAdmin: false,
      branches: [],
      districtCodes: [],
      // Operator-facing: this goes to the server log, not to the browser.
      reason: loginEntries.length
        ? `holds none of: ${loginEntries.join(', ')}`
        : 'no allowed group configured',
    };
  }

  // Highest role wins.
  const role = isAdmin ? 'ADMIN' : isApprover ? 'BRANCHE_ECLAIREURS' : isChef ? 'CHEF_TROUPE' : null;

  return { allowed: true, role, isAdmin, branches, districtCodes, reason: '' };
}

// --- branche scoping (used by the picture routes) ---------------------------

/**
 * Which branches a user may act on. An empty array means "every branche" —
 * that is the case for ADMIN, and for legacy Branche accounts created before
 * branches existed (so nothing they could do before is taken away).
 */
export const userBranches = (user) =>
  user?.role === 'ADMIN' ? [] : Array.isArray(user?.branches) ? user.branches : [];

/**
 * May this user act on something belonging to `branche`? Unrestricted users
 * (ADMIN, or a Branche account with no branche set) may act on anything.
 */
export function brancheAllowed(user, branche) {
  const mine = userBranches(user);
  if (mine.length === 0) return true;
  if (!branche) return true; // unknown branche: fall back to the district check
  return mine.includes(branche);
}

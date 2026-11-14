// Read-only lookups in the realm, through the nodus client's service account.
//
// Optional: without it the Admin → Accès page still works (free-text instead of
// dropdowns) and sign-in still works (the groups then come from the token's
// Group Membership mapper). See docs/KEYCLOAK.md §5.
//
// The service account needs realm-management view-realm / view-users /
// view-clients — never any manage-* role.

import { keycloak } from '../config/keycloak.js';

const CACHE_MS = 60 * 1000;

let service = null; // { value, expiresAt }
let cache = null; // { at, data: { groups, realmRoles, clientRoles } }
let lastError = '';

export const directoryEnabled = () => keycloak.enabled && !!keycloak.clientSecret;

/** The admin base: KEYCLOAK_ADMIN_URL when the public host blocks /admin/. */
function adminBase() {
  const realm = keycloak.issuer.split('/realms/')[1] || 'QG_CMS';
  const host = keycloak.adminUrl || keycloak.issuer.split('/realms/')[0];
  return `${host}/admin/realms/${encodeURIComponent(realm)}`;
}

async function serviceToken() {
  if (!directoryEnabled()) throw new Error('Le compte de service Keycloak n\'est pas configuré');
  if (service && service.expiresAt > Date.now() + 15_000) return service.value;

  // The token host follows the admin host when one is set, so a Keycloak that
  // only exposes /admin/ on a separate hostname still works.
  const base = keycloak.adminUrl
    ? `${keycloak.adminUrl}/realms/${encodeURIComponent(
        keycloak.issuer.split('/realms/')[1] || 'QG_CMS'
      )}`
    : keycloak.issuer;

  const res = await fetch(`${base}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: keycloak.clientId,
      client_secret: keycloak.clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Le compte de service « ${keycloak.clientId} » n'a pas obtenu de jeton (${body.error_description || body.error || res.status})`
    );
  }
  service = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 60) * 1000 };
  return service.value;
}

async function adminGet(path) {
  const token = await serviceToken();
  const res = await fetch(`${adminBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) service = null;
  if (!res.ok) {
    const err = new Error(
      res.status === 403
        ? `Le compte de service « ${keycloak.clientId} » ne peut pas lire le realm — attribuez-lui view-realm, view-users et view-clients`
        : `Keycloak a répondu ${res.status} sur ${path}`
    );
    err.httpStatus = res.status;
    throw err;
  }
  return res.json();
}

/** Flatten the group tree into full paths: "/CU", "/QG/Eclaireurs". */
const flatten = (groups, out = []) => {
  for (const g of groups || []) {
    if (g.path) out.push(g.path);
    if (g.subGroups?.length) flatten(g.subGroups, out);
  }
  return out;
};

/**
 * The realm's groups and roles for the Admin → Accès dropdowns.
 * Cached for a minute. Returns null (never throws) when the lookup fails;
 * `lastDirectoryError()` then says why.
 */
export async function realmDirectory({ force = false } = {}) {
  if (!directoryEnabled()) {
    lastError = 'Le compte de service Keycloak n\'est pas configuré (OIDC_CLIENT_SECRET)';
    return null;
  }
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  try {
    const [groups, realmRoles, clients] = await Promise.all([
      adminGet('/groups?briefRepresentation=true&max=2000'),
      adminGet('/roles?max=500'),
      adminGet(`/clients?clientId=${encodeURIComponent(keycloak.clientId)}`),
    ]);

    let clientRoles = [];
    const own = Array.isArray(clients) ? clients[0] : null;
    if (own?.id) {
      clientRoles = (await adminGet(`/clients/${own.id}/roles?max=500`)).map((r) => r.name);
    }

    const data = {
      groups: flatten(groups).sort((a, b) => a.localeCompare(b, 'fr')),
      realmRoles: (realmRoles || [])
        .map((r) => r.name)
        .filter((n) => !n.startsWith('default-roles-'))
        .sort((a, b) => a.localeCompare(b, 'fr')),
      clientRoles: clientRoles.sort((a, b) => a.localeCompare(b, 'fr')),
    };
    cache = { at: Date.now(), data };
    lastError = '';
    return data;
  } catch (err) {
    lastError = err.message;
    console.warn('[keycloak] directory lookup failed:', err.message);
    return null;
  }
}

export const lastDirectoryError = () => lastError;

/**
 * The full group paths of one user, used at sign-in when the token carries no
 * groups claim (the Group Membership mapper is missing on the client).
 * Returns null when the lookup is unavailable.
 */
export async function userGroups(sub) {
  if (!directoryEnabled() || !sub) return null;
  try {
    const groups = await adminGet(`/users/${encodeURIComponent(sub)}/groups?max=200`);
    return (groups || []).map((g) => g.path).filter(Boolean);
  } catch (err) {
    console.warn(`[keycloak] groups of ${sub} not read (${err.message}) — add the groups mapper to the client`);
    return null;
  }
}

// Keycloak / OIDC settings read from the environment. Server-only.
//
// Nodus signs chiefs in with their Scouts du Liban account — the Keycloak of the
// QG CMS (https://inscription-auth.scoutsduliban.org, realm QG_CMS), the same
// login as the registration portal. See docs/KEYCLOAK.md.

const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const trimSlash = (s) => String(s || '').trim().replace(/\/+$/, '');

const flag = (v, fallback) =>
  v === undefined || v === ''
    ? fallback
    : !/^(false|0|no|off|disabled?)$/i.test(String(v).trim());

// The realm URL: OIDC_ISSUER wins; otherwise KEYCLOAK_URL + KEYCLOAK_REALM.
//   SDL  https://inscription-auth.scoutsduliban.org/realms/QG_CMS
const issuer = trimSlash(
  process.env.OIDC_ISSUER ||
    (process.env.KEYCLOAK_URL
      ? `${trimSlash(process.env.KEYCLOAK_URL)}/realms/${encodeURIComponent(
          process.env.KEYCLOAK_REALM || 'QG_CMS'
        )}`
      : '')
);

/**
 * Keycloak sign-in. Off when no realm URL is configured — nodus then only
 * offers its own email + password form (the pre-Keycloak behaviour).
 */
export const keycloak = {
  enabled: !!issuer && flag(process.env.KEYCLOAK_ENABLED, true),
  issuer,
  // Admin hostname of the same Keycloak when the public one blocks /admin/
  // (SDL: admin.auth…). Only used to list groups/roles for the admin page.
  adminUrl: trimSlash(process.env.KEYCLOAK_ADMIN_URL),
  clientId: process.env.OIDC_CLIENT_ID || 'nodus',
  clientSecret: process.env.OIDC_CLIENT_SECRET || '',
  scope: process.env.OIDC_SCOPE || 'openid profile email',
  // Claim filled by a "Group Membership" mapper on the client (docs/KEYCLOAK.md).
  groupsClaim: process.env.OIDC_GROUPS_CLAIM || 'groups',

  // --- who gets what, as `holdsAny` entries (utils/keycloakAccess.js) ---
  //   admin          role "admin" on nodus's own client
  //   realm:Name     realm role
  //   /Group         member of that group (or a subgroup)
  // Environment defaults; the Admin → Accès page adds to these and can never
  // remove them, so a server stays pinned by configuration.
  adminRoles: list(process.env.KEYCLOAK_ADMIN_ROLES || 'admin'),
  // Who may approve pictures (becomes BRANCHE_ECLAIREURS). Empty = nobody by env.
  approveRoles: list(process.env.KEYCLOAK_APPROVE_ROLES),
  // Who may upload for their troupe (becomes CHEF_TROUPE). Empty = nobody by env.
  chefRoles: list(process.env.KEYCLOAK_CHEF_ROLES),
  // Who may sign in at all. Empty: every account of the realm. Admins always get in.
  loginRoles: list(process.env.KEYCLOAK_LOGIN_ROLES),

  // The origin the browser uses to reach the API — the OIDC redirect URI is
  // built from it. Falls back to the request's own origin when unset.
  publicBaseUrl: trimSlash(process.env.PUBLIC_BASE_URL),
  // Where the browser lands after the round trip (the SPA). Defaults to CLIENT_URL.
  clientUrl: trimSlash(process.env.CLIENT_URL) || 'http://localhost:5173',
  // Plain-http Keycloak is only acceptable on a laptop.
  allowInsecure: issuer.startsWith('http://'),
};

/**
 * The Inscription (QG) API — used at sign-in to read who the chief is
 * (GET /Profile) and to link them to their troupe. See utils/inscription.js.
 */
export const inscription = {
  baseUrl: trimSlash(
    process.env.SDL_REGISTRY_URL || 'https://inscription-api.scoutsduliban.org/api'
  ),
  // Auto-link a CHEF_TROUPE to their nodus Troupe from their Inscription unit.
  autoLinkTroupe: flag(process.env.INSCRIPTION_AUTO_LINK_TROUPE, true),
};

/**
 * Email + password form. Only the normal way in while Keycloak is off; once
 * Keycloak is configured it is reserved for the break-glass admin below.
 */
export const passwordLogin = flag(
  process.env.LOCAL_LOGIN,
  !keycloak.enabled
);

/**
 * Break-glass administrator from the environment (LOCAL_ADMIN_USERNAME /
 * LOCAL_ADMIN_PASSWORD): signs in on the password form even when Keycloak is
 * down or LOCAL_LOGIN=false, is always an admin, and its password is compared
 * against the env on every sign-in — never stored. LOCAL_ADMIN_ENABLED=false
 * switches it off without deleting the values. In production a placeholder or
 * a password shorter than 12 characters disables it too (with a warning).
 */
const PLACEHOLDER_PASSWORDS = new Set([
  'change-me',
  'change-me-to-a-long-random-string',
  'changeme',
  'password',
  'secret',
  'admin',
]);

const adminUser = String(process.env.LOCAL_ADMIN_USERNAME || '').trim().toLowerCase();
const adminPass = process.env.LOCAL_ADMIN_PASSWORD || '';
const adminOn = flag(process.env.LOCAL_ADMIN_ENABLED, true) && !!adminUser && !!adminPass;
const adminWeak =
  process.env.NODE_ENV === 'production' &&
  (adminPass.length < 12 || PLACEHOLDER_PASSWORDS.has(adminPass));

if (adminOn && adminWeak) {
  console.warn(
    '[auth] LOCAL_ADMIN_PASSWORD must be 12+ characters and not a placeholder in production — break-glass admin disabled'
  );
}

export const localAdmin = {
  enabled: adminOn && !adminWeak,
  username: adminUser,
  password: adminPass,
  name: process.env.LOCAL_ADMIN_NAME || 'Administrateur de secours',
  // The User row behind the session (role ADMIN, no password hash).
  email: adminUser.includes('@') ? adminUser : `${adminUser}@local.admin`,
};

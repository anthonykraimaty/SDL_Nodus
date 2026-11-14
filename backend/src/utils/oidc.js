// Keycloak sign-in: OpenID Connect authorization code + PKCE, with `openid-client`.
// Nothing here touches the database — the callback route turns the identity into a User.

import * as client from 'openid-client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { keycloak } from '../config/keycloak.js';

export const CALLBACK_PATH = '/api/auth/keycloak/callback';
// The PKCE verifier + state wait in this cookie between the two redirects.
export const PENDING_COOKIE = 'nodus_oidc';
export const PENDING_COOKIE_PATH = '/api/auth/keycloak';
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

let pending = null;
let jwks = null;

/**
 * Discovery, done once and shared. A failure is not cached, so a Keycloak
 * outage needs no restart.
 */
export function getOidc() {
  if (!keycloak.enabled) {
    return Promise.reject(new Error("La connexion Keycloak n'est pas configurée"));
  }
  if (!pending) {
    pending = client
      .discovery(
        new URL(keycloak.issuer),
        keycloak.clientId,
        keycloak.clientSecret || undefined,
        undefined,
        keycloak.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined
      )
      .then((oidc) => {
        jwks = createRemoteJWKSet(new URL(oidc.serverMetadata().jwks_uri));
        return oidc;
      })
      .catch((err) => {
        pending = null;
        throw Object.assign(
          new Error(`Keycloak unreachable (${keycloak.issuer}): ${err.message}`),
          { cause: err }
        );
      });
  }
  return pending;
}

/** The origin the browser sees for the API — PUBLIC_BASE_URL, else this request. */
export function publicOrigin(req) {
  if (keycloak.publicBaseUrl) return keycloak.publicBaseUrl;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

/** Only ever send the browser back to a path of the SPA. */
export function safeReturnTo(v) {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') ? s : '/dashboard';
}

/** Build a URL on the SPA (CLIENT_URL), with query params. */
export function clientUrl(path, params = {}) {
  const url = new URL(path, `${keycloak.clientUrl}/`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.href;
}

// What Keycloak answers a silent (prompt=none) check when there is no session to reuse.
export const SILENT_MISS = new Set([
  'login_required',
  'interaction_required',
  'consent_required',
  'account_selection_required',
]);

/**
 * `silent`: prompt=none — Keycloak never shows its form, it either signs in
 * from its existing session or answers login_required.
 */
export async function startLogin(origin, { silent = false } = {}) {
  const oidc = await getOidc();
  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const url = client.buildAuthorizationUrl(oidc, {
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    scope: keycloak.scope,
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    ...(silent ? { prompt: 'none' } : {}),
  });
  return { url: url.href, codeVerifier, state };
}

/**
 * Exchange the code that came back. `currentUrl` must be the public callback
 * URL (origin + path + query) — behind a proxy the request's own URL is not it.
 */
export async function finishLogin(currentUrl, { codeVerifier, state }) {
  const oidc = await getOidc();
  const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
  });
  // Keycloak puts realm_access / resource_access in the access token, not the ID token.
  const { payload: accessClaims } = await jwtVerify(tokens.access_token, jwks, {
    issuer: oidc.serverMetadata().issuer,
  });
  return {
    idClaims: tokens.claims(),
    accessClaims,
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
  };
}

/** Where to send the browser so the Keycloak session ends too. */
export async function logoutUrl(idToken, postLogout) {
  const oidc = await getOidc();
  if (!oidc.serverMetadata().end_session_endpoint) return postLogout;
  const params = { post_logout_redirect_uri: postLogout, client_id: keycloak.clientId };
  // Without the hint Keycloak asks "Do you want to log out?" first.
  if (idToken) params.id_token_hint = idToken;
  return client.buildEndSessionUrl(oidc, params).href;
}

/** What nodus keeps about a Keycloak account, from the ID + access token claims. */
export function identityFromClaims(idClaims, accessClaims = {}) {
  const pick = (key) => accessClaims[key] ?? idClaims[key];
  const rawGroups = pick(keycloak.groupsClaim);
  return {
    sub: idClaims.sub,
    username: idClaims.preferred_username || '',
    name:
      idClaims.name ||
      [idClaims.given_name, idClaims.family_name].filter(Boolean).join(' ') ||
      idClaims.preferred_username ||
      '',
    email: String(idClaims.email || '').toLowerCase(),
    realmRoles: pick('realm_access')?.roles || [],
    clientRoles: pick('resource_access')?.[keycloak.clientId]?.roles || [],
    groups: Array.isArray(rawGroups) ? rawGroups.filter((g) => typeof g === 'string') : [],
    // False when the token carries no groups claim at all (mapper missing).
    groupsClaimed: Array.isArray(rawGroups),
  };
}

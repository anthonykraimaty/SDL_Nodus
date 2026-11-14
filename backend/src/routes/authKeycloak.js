// Keycloak sign-in for the Nodus SPA.
//
// Nodus's frontend is a Vite SPA that keeps a nodus JWT in localStorage, so the
// OIDC round trip cannot simply set a session cookie and render a page:
//
//   1. GET  /api/auth/keycloak/login      → 302 to Keycloak (PKCE verifier in a cookie)
//   2. GET  /api/auth/keycloak/callback   → exchanges the code, finds/creates the
//                                           User, stores a one-time ticket and
//                                           302s to the SPA with ?kc=<ticket>
//   3. POST /api/auth/keycloak/exchange   → the SPA trades the ticket for its
//                                           usual { token, user } payload
//
// The ticket is single-use and lives 60 s in memory, so the nodus JWT never
// travels in a URL (no referrer leak, no browser history, no server log).

import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { keycloak, inscription as inscriptionCfg } from '../config/keycloak.js';
import { generateToken } from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';
import {
  CALLBACK_PATH,
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  PENDING_MAX_AGE_MS,
  SILENT_MISS,
  clientUrl,
  finishLogin,
  identityFromClaims,
  logoutUrl,
  publicOrigin,
  safeReturnTo,
  startLogin,
} from '../utils/oidc.js';
import { getAccessSettings, resolveAccess } from '../utils/keycloakAccess.js';
import { fetchProfile, autoLinkTroupe } from '../utils/inscription.js';
import { userGroups } from '../utils/keycloakDirectory.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const prisma = new PrismaClient();

// --- one-time tickets -------------------------------------------------------

const TICKET_TTL_MS = 60 * 1000;
const tickets = new Map(); // ticket → { payload, expiresAt }

const sweepTickets = () => {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.expiresAt <= now) tickets.delete(k);
};

function issueTicket(payload) {
  sweepTickets();
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { payload, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

function claimTicket(ticket) {
  sweepTickets();
  const hit = tickets.get(String(ticket || ''));
  if (!hit) return null;
  tickets.delete(ticket); // single use
  return hit.payload;
}

// --- cookies ----------------------------------------------------------------

const cookieOpts = (maxAgeMs, path) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // The callback is a top-level redirect coming back from Keycloak, so the
  // cookie must survive a cross-site navigation.
  sameSite: 'lax',
  path,
  maxAge: maxAgeMs,
});

const readPending = (req) => {
  try {
    return JSON.parse(
      Buffer.from(req.cookies?.[PENDING_COOKIE] || '', 'base64url').toString('utf8')
    );
  } catch {
    return null;
  }
};

const clearPending = (res) => res.clearCookie(PENDING_COOKIE, { path: PENDING_COOKIE_PATH });

/** Back to the SPA's login page with an error code it knows how to phrase. */
const backToLogin = (res, error, extra = {}) => {
  clearPending(res);
  return res.redirect(clientUrl('/login', { error, ...extra }));
};

// --- 0. is Keycloak available? ---------------------------------------------

// GET /api/auth/keycloak/status — the SPA asks before drawing the login page,
// so it knows whether to show the Keycloak button, the password form, or both.
router.get('/status', (req, res) => {
  res.json({
    enabled: keycloak.enabled,
    // The password form is only drawn when something can actually use it.
    passwordLogin: res.locals?.passwordLogin ?? undefined,
    issuer: keycloak.enabled ? keycloak.issuer : null,
    realm: keycloak.enabled ? keycloak.issuer.split('/realms/')[1] || null : null,
  });
});

// --- 1. start ---------------------------------------------------------------

// GET /api/auth/keycloak/login?returnTo=/dashboard&silent=1
// ?silent=1 (sent by the SPA on a first visit): prompt=none, so an open
// Keycloak session signs the chief in without a click.
router.get('/login', authLimiter, async (req, res) => {
  if (!keycloak.enabled) return backToLogin(res, 'keycloak-off');

  const origin = publicOrigin(req);
  const silent = req.query.silent === '1';
  const returnTo = safeReturnTo(req.query.returnTo);

  try {
    const { url, codeVerifier, state } = await startLogin(origin, { silent });
    const pending = { codeVerifier, state, returnTo, silent, at: Date.now() };
    res.cookie(
      PENDING_COOKIE,
      Buffer.from(JSON.stringify(pending)).toString('base64url'),
      cookieOpts(PENDING_MAX_AGE_MS, PENDING_COOKIE_PATH)
    );
    return res.redirect(url);
  } catch (err) {
    console.error('Keycloak login start failed:', err.message);
    return backToLogin(res, 'keycloak-down');
  }
});

// --- 2. callback ------------------------------------------------------------

router.get('/callback', async (req, res) => {
  if (!keycloak.enabled) return backToLogin(res, 'keycloak-off');

  const origin = publicOrigin(req);
  const pending = readPending(req);

  // Keycloak refused or answered a silent check.
  if (req.query.error) {
    const code = String(req.query.error);
    if (SILENT_MISS.has(code)) {
      // No Keycloak session to reuse: just show the login page, no error.
      clearPending(res);
      return res.redirect(
        clientUrl('/login', { sso: '0', next: safeReturnTo(pending?.returnTo) })
      );
    }
    return backToLogin(res, code === 'access_denied' ? 'denied' : 'keycloak-error');
  }

  if (!pending?.codeVerifier || Date.now() - (pending.at || 0) > PENDING_MAX_AGE_MS) {
    // Stale tab, back button or a bookmarked callback: start over.
    clearPending(res);
    return res.redirect(`${origin}/api/auth/keycloak/login`);
  }

  let result;
  try {
    // The public callback URL, not the request's own (which may be the proxy's).
    const qs = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';
    result = await finishLogin(new URL(`${CALLBACK_PATH}${qs}`, origin), pending);
  } catch (err) {
    console.error('Keycloak callback failed:', err.message);
    return backToLogin(res, 'keycloak-error');
  }

  const identity = identityFromClaims(result.idClaims, result.accessClaims);
  if (!identity.sub) return backToLogin(res, 'keycloak-error');

  // No groups claim in the token (mapper missing): ask the admin API instead.
  if (!identity.groupsClaimed) identity.groups = (await userGroups(identity.sub)) ?? [];

  // --- who is this, in nodus terms? ---
  const settings = await getAccessSettings();
  const access = await resolveAccess(identity, settings);

  if (!access.allowed) {
    console.warn(
      `[auth] ${identity.username || identity.sub} refused — ${access.reason}`
    );
    return backToLogin(res, 'no-access');
  }

  const email = identity.email || `${identity.username || identity.sub}@keycloak.local`;

  try {
    // Match by Keycloak id first, then by email, so a chief who already had a
    // nodus password account keeps their pictures.
    let user =
      (await prisma.user.findUnique({ where: { keycloakSub: identity.sub } })) ||
      (await prisma.user.findUnique({ where: { email } }));

    if (user && !user.isActive) return backToLogin(res, 'disabled');

    // Keycloak may promote but never demote: a role an admin set by hand in
    // Admin → Utilisateurs survives a sign-in that would grant less.
    const RANK = { CHEF_TROUPE: 1, BRANCHE_ECLAIREURS: 2, ADMIN: 3 };
    const keepRole =
      user && access.role && RANK[user.role] > RANK[access.role] ? user.role : access.role;

    const data = {
      keycloakSub: identity.sub,
      provider: 'KEYCLOAK',
      username: identity.username || null,
      name: identity.name || user?.name || email,
      realmRoles: identity.realmRoles,
      clientRoles: identity.clientRoles,
      keycloakGroups: identity.groups,
      lastLogin: new Date(),
    };
    // A role is only written when Keycloak actually grants one; an account that
    // matches no rule keeps whatever an admin gave it.
    if (keepRole) data.role = keepRole;
    // isAdmin is the "Branche member with admin powers" flag (middleware/auth.js).
    if (access.isAdmin && keepRole === 'BRANCHE_ECLAIREURS') data.isAdmin = true;
    // Branche scoping only means something for an approver.
    if (keepRole === 'BRANCHE_ECLAIREURS') data.branches = access.branches;

    user = user
      ? await prisma.user.update({ where: { id: user.id }, data })
      : await prisma.user.create({
          data: { email, password: null, forcePasswordChange: false, ...data },
        });

    // --- Inscription: who they are at QG, and which troupe they lead ---
    const profile = await fetchProfile(result.accessToken);
    if (profile) {
      const troupeId = await autoLinkTroupe(user, profile);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { inscription: profile, ...(troupeId ? { troupeId } : {}) },
      });
    }

    // --- districts for an approver, from the matched rules ---
    if (user.role === 'BRANCHE_ECLAIREURS' && access.districtCodes.length > 0) {
      const districts = await prisma.district.findMany({
        where: { code: { in: access.districtCodes } },
        select: { id: true },
      });
      // Add what Keycloak grants; never remove what an admin granted by hand.
      await prisma.userDistrictAccess.createMany({
        data: districts.map((d) => ({ userId: user.id, districtId: d.id })),
        skipDuplicates: true,
      });
    }

    const token = generateToken(user.id);
    const ticket = issueTicket({ token, userId: user.id });

    clearPending(res);
    // The ID token lets "Se déconnecter" end the Keycloak session too.
    res.cookie(
      'nodus_kc_id',
      result.idToken || '',
      cookieOpts(7 * 24 * 60 * 60 * 1000, '/api/auth')
    );
    return res.redirect(
      clientUrl('/auth/callback', { kc: ticket, next: safeReturnTo(pending.returnTo) })
    );
  } catch (err) {
    console.error('Keycloak sign-in failed:', err);
    return backToLogin(res, 'server-error');
  }
});

// --- 3. the SPA collects its token ------------------------------------------

// POST /api/auth/keycloak/exchange  { ticket }  → { token, user }
router.post('/exchange', authLimiter, async (req, res) => {
  const payload = claimTicket(req.body?.ticket);
  if (!payload) {
    return res.status(401).json({ error: 'Lien de connexion expiré ou déjà utilisé' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        troupe: {
          include: { group: { include: { district: true } }, patrouilles: true },
        },
        districtAccess: { include: { district: true } },
      },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Compte introuvable ou désactivé' });
    }

    const { password: _, ...safeUser } = user;
    return res.json({
      message: 'Login successful',
      token: payload.token,
      user: safeUser,
      // A Keycloak account never changes a nodus password.
      forcePasswordChange: false,
      // The SPA tells a chief with no troupe to contact their commissaire.
      needsTroupe: user.role === 'CHEF_TROUPE' && !user.troupeId,
    });
  } catch (err) {
    console.error('Keycloak exchange failed:', err);
    return res.status(500).json({ error: 'Échec de la connexion' });
  }
});

// --- 4. sign out ------------------------------------------------------------

// GET /api/auth/keycloak/logout — ends the Keycloak session as well, then
// sends the browser back to the SPA's login page. The nodus token is
// blacklisted by the usual POST /api/auth/logout, which the SPA calls first.
router.get('/logout', async (req, res) => {
  const idToken = req.cookies?.nodus_kc_id || '';
  res.clearCookie('nodus_kc_id', { path: '/api/auth' });
  const postLogout = clientUrl('/login', { signedout: '1' });
  if (!keycloak.enabled) return res.redirect(postLogout);
  try {
    return res.redirect(await logoutUrl(idToken, postLogout));
  } catch (err) {
    console.warn('Keycloak logout URL failed:', err.message);
    return res.redirect(postLogout);
  }
});

// --- 5. what Keycloak says about me (debugging an access rule) --------------

// GET /api/auth/keycloak/whoami — the raw claims nodus stored at the last
// sign-in, so an admin can see why a rule did or did not match.
router.get('/whoami', authenticate, async (req, res) => {
  const u = req.user;
  res.json({
    provider: u.provider,
    keycloakSub: u.keycloakSub,
    username: u.username,
    realmRoles: u.realmRoles || [],
    clientRoles: u.clientRoles || [],
    groups: u.keycloakGroups || [],
    branches: u.branches || [],
    role: u.role,
    isAdmin: u.isAdmin,
    troupeId: u.troupeId,
    inscription: u.inscription || null,
    inscriptionEnabled: !!inscriptionCfg.baseUrl,
  });
});

export default router;

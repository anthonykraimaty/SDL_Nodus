// Admin → Accès: who may sign in with a Scouts du Liban account, who becomes
// an admin, and who may approve pictures for which branche and districts.
//
// These rules are applied at every Keycloak sign-in (routes/authKeycloak.js).
// The environment defaults (KEYCLOAK_*_ROLES) always count on top and cannot be
// removed here, so a server stays pinned by configuration.

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimiter.js';
import { keycloak } from '../config/keycloak.js';
import {
  BRANCHES,
  DEFAULT_ACCESS,
  getAccessSettings,
  saveAccessSettings,
  resolveAccess,
} from '../utils/keycloakAccess.js';
import {
  directoryEnabled,
  lastDirectoryError,
  realmDirectory,
} from '../utils/keycloakDirectory.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/access - the current rules, plus what the UI needs to render them
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const [settings, districts] = await Promise.all([
      getAccessSettings(),
      prisma.district.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    res.json({
      settings,
      defaults: DEFAULT_ACCESS,
      branches: BRANCHES,
      districts,
      keycloak: {
        enabled: keycloak.enabled,
        issuer: keycloak.enabled ? keycloak.issuer : null,
        clientId: keycloak.clientId,
        // Pinned by the environment — shown read-only next to the editable rules.
        env: {
          adminRoles: keycloak.adminRoles,
          approveRoles: keycloak.approveRoles,
          chefRoles: keycloak.chefRoles,
          loginRoles: keycloak.loginRoles,
        },
        directoryEnabled: directoryEnabled(),
      },
    });
  } catch (err) {
    console.error('Failed to load access settings:', err);
    res.status(500).json({ error: 'Failed to load access settings' });
  }
});

// PUT /api/access - replace the rules
router.put('/', authenticate, authorize('ADMIN'), sensitiveLimiter, async (req, res) => {
  try {
    const settings = await saveAccessSettings(req.body, req.user.id);
    console.log(`[access] rules updated by ${req.user.email}`);
    res.json({ settings });
  } catch (err) {
    console.error('Failed to save access settings:', err);
    res.status(500).json({ error: 'Failed to save access settings' });
  }
});

// GET /api/access/directory - the realm's groups and roles for the dropdowns.
// ?refresh=1 bypasses the one-minute cache.
router.get('/directory', authenticate, authorize('ADMIN'), async (req, res) => {
  const data = await realmDirectory({ force: req.query.refresh === '1' });
  if (!data) {
    // Not an error for the page: it falls back to free text.
    return res.json({
      available: false,
      reason: lastDirectoryError(),
      groups: [],
      realmRoles: [],
      clientRoles: [],
      // So the admin still has something to pick from: what already signed-in
      // accounts actually carry.
      seen: await seenInRealm(),
    });
  }
  res.json({ available: true, reason: '', ...data });
});

/** Groups and realm roles nodus has actually seen on signed-in accounts. */
async function seenInRealm() {
  const users = await prisma.user.findMany({
    where: { provider: 'KEYCLOAK' },
    select: { keycloakGroups: true, realmRoles: true, clientRoles: true },
    take: 2000,
  });
  const uniq = (key) =>
    [...new Set(users.flatMap((u) => u[key] || []))].sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    groups: uniq('keycloakGroups'),
    realmRoles: uniq('realmRoles'),
    clientRoles: uniq('clientRoles'),
  };
}

// POST /api/access/test - what would these rules do to an identity?
// Body: { groups: [], realmRoles: [], clientRoles: [] } or { userId }
// Lets an admin check a rule before saving it, and explain a refused sign-in.
router.post('/test', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    let identity;
    if (req.body?.userId) {
      const u = await prisma.user.findUnique({ where: { id: Number(req.body.userId) } });
      if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
      identity = {
        groups: u.keycloakGroups || [],
        realmRoles: u.realmRoles || [],
        clientRoles: u.clientRoles || [],
      };
    } else {
      identity = {
        groups: Array.isArray(req.body?.groups) ? req.body.groups : [],
        realmRoles: Array.isArray(req.body?.realmRoles) ? req.body.realmRoles : [],
        clientRoles: Array.isArray(req.body?.clientRoles) ? req.body.clientRoles : [],
      };
    }
    // Test against the rules in the body when given (unsaved draft), else the stored ones.
    const settings = req.body?.settings ? undefined : await getAccessSettings();
    const result = await resolveAccess(identity, settings ?? req.body.settings);
    res.json({ identity, result });
  } catch (err) {
    console.error('Access test failed:', err);
    res.status(500).json({ error: 'Access test failed' });
  }
});

export default router;

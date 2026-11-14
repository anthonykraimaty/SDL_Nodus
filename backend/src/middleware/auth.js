import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { isTokenBlacklisted } from '../utils/tokenBlacklist.js';

const prisma = new PrismaClient();

// Middleware to verify JWT token
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if token is blacklisted (logged out)
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been invalidated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { troupe: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Attach user and token to request object
    req.user = user;
    req.token = token;
    req.tokenExp = decoded.exp;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// A BRANCHE member flagged with isAdmin passes ADMIN-gated checks without
// losing BRANCHE-specific behavior (district filtering, review queue, etc.).
export const isEffectiveAdmin = (user) =>
  user?.role === 'ADMIN' ||
  (user?.role === 'BRANCHE_ECLAIREURS' && user?.isAdmin === true);

// Middleware to check user role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (roles.includes(req.user.role)) {
      return next();
    }

    if (roles.includes('ADMIN') && isEffectiveAdmin(req.user)) {
      return next();
    }

    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

// Returns true if a BRANCHE_ECLAIREURS user has explicit access to a given district.
// ADMINs are allowed everywhere. Deny-by-default: a BRANCHE with no district
// assignments can see/modify nothing.
export const brancheHasDistrictAccess = async (user, districtId) => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'BRANCHE_ECLAIREURS') return false;
  if (!districtId) return false;

  const access = await prisma.userDistrictAccess.findFirst({
    where: { userId: user.id, districtId },
    select: { id: true },
  });
  return !!access;
};

// Which branches a BRANCHE_ECLAIREURS user may review.
// An empty list means "every branche": that is the case for ADMIN, and for
// Branche accounts created before branches existed, so nothing an existing
// reviewer could do is taken away by this feature.
export const userBranches = (user) =>
  user?.role === 'ADMIN' || isEffectiveAdmin(user)
    ? []
    : Array.isArray(user?.branches)
      ? user.branches
      : [];

/**
 * Returns true if the user may act on a troupe of `branche`.
 * Deny-by-default does NOT apply here on purpose: a reviewer with no branche
 * set keeps the pre-Keycloak behaviour (all branches). Keycloak sign-in is what
 * narrows them, by writing `branches` from the Admin → Accès rules.
 */
export const brancheHasAccess = (user, branche) => {
  const mine = userBranches(user);
  if (mine.length === 0) return true;
  if (!branche) return true; // unknown: the district check still applies
  return mine.includes(branche);
};

/**
 * The combined scope check for a Branche reviewer acting on a picture set:
 * the set's district must be one of theirs AND its troupe's branche must be
 * one they review. ADMIN passes both.
 *
 * `set` must have been loaded with troupe → group → district.
 * Returns null when allowed, or an { status, error } to send back.
 */
export const checkReviewScope = async (user, set) => {
  if (user?.role !== 'BRANCHE_ECLAIREURS') return null;

  const districtId = set?.troupe?.group?.district?.id;
  if (!(await brancheHasDistrictAccess(user, districtId))) {
    return {
      status: 403,
      error: "Vous n'avez pas accès aux photos de ce district",
    };
  }

  const branche = set?.troupe?.branche;
  if (!brancheHasAccess(user, branche)) {
    return {
      status: 403,
      error: `Vous ne traitez pas la branche ${branche} (vos branches : ${userBranches(user).join(', ')})`,
    };
  }
  return null;
};

// Optional authentication (for public endpoints that behave differently when authenticated)
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { troupe: true },
      });

      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};

import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { authLimiter, passwordChangeLimiter } from '../middleware/rateLimiter.js';
import { blacklistToken } from '../utils/tokenBlacklist.js';
import { keycloak, localAdmin, passwordLogin } from '../config/keycloak.js';

const router = express.Router();
const prisma = new PrismaClient();

// Password complexity validation
const validatePasswordComplexity = (password) => {
  const errors = [];
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  return errors;
};

// POST /api/auth/register - Register new user (admin only)
router.post('/register', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { email, password, role, troupeId } = req.body;
    const name = sanitizeInput(req.body.name);

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password complexity
    const passwordErrors = validatePasswordComplexity(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: passwordErrors.join('. ') });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Validate role
    const validRoles = ['ADMIN', 'CHEF_TROUPE', 'BRANCHE_ECLAIREURS'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Validate role-specific requirements
    if (role === 'CHEF_TROUPE' && !troupeId) {
      return res.status(400).json({ error: 'Chef Troupe must be assigned to a troupe' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        name,
        role: role || 'CHEF_TROUPE',
        troupeId: troupeId || null,
      },
      include: {
        troupe: {
          include: {
            group: {
              include: {
                district: true,
              },
            },
          },
        },
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: 'User registered successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// GET /api/auth/methods - how may someone sign in on this server?
// The login page asks this first, so it knows whether to show the Keycloak
// button, the password form, or both.
router.get('/methods', (req, res) => {
  res.json({
    keycloak: keycloak.enabled,
    // The password form is drawn when ordinary passwords still work, or when
    // only the break-glass admin can use it (then behind a discreet link).
    password: passwordLogin,
    breakGlass: !passwordLogin && localAdmin.enabled,
    realm: keycloak.enabled ? keycloak.issuer.split('/realms/')[1] || null : null,
  });
});

/**
 * The break-glass administrator from the environment: signs in on the password
 * form even when Keycloak is down or LOCAL_LOGIN=false, is always an ADMIN, and
 * its password is compared against the env on every sign-in — never stored.
 * Its User row carries no password hash, so it cannot be used any other way.
 */
const loginAsBreakGlassAdmin = async (identifier, password) => {
  if (!localAdmin.enabled) return null;
  const given = String(identifier || '').trim().toLowerCase();
  if (given !== localAdmin.username && given !== localAdmin.email) return null;
  // Constant-time compare so the password length/content does not leak.
  const a = Buffer.from(password || '');
  const b = Buffer.from(localAdmin.password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // Find or create the row the session hangs off. Never given a hash.
  let user = await prisma.user.findUnique({ where: { email: localAdmin.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: localAdmin.email,
        password: null,
        name: localAdmin.name,
        role: 'ADMIN',
        provider: 'LOCAL',
        forcePasswordChange: false,
      },
    });
    console.warn(`[auth] break-glass admin row created for ${localAdmin.email}`);
  } else if (user.role !== 'ADMIN' || !user.isActive) {
    // It can never be demoted or disabled — that is the point of break-glass.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', isActive: true },
    });
  }
  console.warn(`[auth] break-glass admin signed in (${localAdmin.email})`);
  return user;
};

// POST /api/auth/login - Login with email + password (rate limited)
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // The break-glass admin first: it must work even when passwords are off.
    const breakGlass = await loginAsBreakGlassAdmin(email, password);
    if (breakGlass) {
      await prisma.user.update({
        where: { id: breakGlass.id },
        data: { lastLogin: new Date() },
      });
      const { password: _bgPw, ...safeUser } = breakGlass;
      return res.json({
        message: 'Login successful',
        token: generateToken(breakGlass.id),
        user: safeUser,
        forcePasswordChange: false,
        breakGlass: true,
      });
    }

    // Ordinary password login, only while it is switched on. Note this also
    // answers a wrong break-glass password: deliberately, so the response never
    // confirms that the break-glass username exists.
    if (!passwordLogin) {
      return res.status(403).json({
        error: localAdmin.enabled
          ? 'Identifiants invalides, ou connexion par mot de passe désactivée. Utilisez votre compte Scouts du Liban.'
          : 'La connexion par mot de passe est désactivée. Utilisez votre compte Scouts du Liban.',
        code: 'PASSWORD_LOGIN_DISABLED',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        troupe: {
          include: {
            group: {
              include: {
                district: true,
              },
            },
            patrouilles: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // A Keycloak-only account has no password of its own: send them to the
    // Scouts du Liban button rather than letting them guess a password forever.
    if (!user.password) {
      return res.status(403).json({
        error: 'Ce compte se connecte avec un compte Scouts du Liban.',
        code: 'USE_KEYCLOAK',
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update lastLogin timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Generate token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword,
      forcePasswordChange: user.forcePasswordChange,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        troupe: {
          include: {
            group: {
              include: {
                district: true,
              },
            },
            patrouilles: true,
          },
        },
      },
    });

    const { password: _, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// POST /api/auth/logout - Logout (invalidates token)
router.post('/logout', authenticate, (req, res) => {
  // Add token to blacklist
  if (req.token && req.tokenExp) {
    blacklistToken(req.token, req.tokenExp);
  }
  res.json({ message: 'Logout successful' });
});

// PUT /api/auth/profile - Update profile (name and/or email)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    const name = req.body.name ? sanitizeInput(req.body.name) : null;

    // Validate that at least one field is provided
    if ((!name || !name.trim()) && (!email || !email.trim())) {
      return res.status(400).json({ error: 'Name or email is required' });
    }

    // Name and email of a Keycloak account are refreshed from the realm at every
    // sign-in, so editing them here would silently revert at the next login.
    if (req.user.provider === 'KEYCLOAK') {
      return res.status(403).json({
        error: 'Votre nom et votre email proviennent de votre compte Scouts du Liban.',
        code: 'USE_KEYCLOAK',
      });
    }

    const updateData = {};

    // Handle name update (already sanitized)
    if (name && name.trim()) {
      updateData.name = name.trim();
    }

    // Handle email update
    if (email && email.trim()) {
      const newEmail = email.trim().toLowerCase();

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: newEmail,
          NOT: { id: req.user.id },
        },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email is already in use by another account' });
      }

      updateData.email = newEmail;
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      include: {
        troupe: {
          include: {
            group: {
              include: {
                district: true,
              },
            },
            patrouilles: true,
          },
        },
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json({
      message: 'Profile updated successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/auth/change-password - Change password (rate limited)
router.post('/change-password', authenticate, passwordChangeLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Validate password complexity
    const passwordErrors = validatePasswordComplexity(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: passwordErrors.join('. ') });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    // A Keycloak account has no nodus password: it is changed in the Scouts du
    // Liban account, not here.
    if (!user.password || user.provider === 'KEYCLOAK') {
      return res.status(403).json({
        error: 'Votre mot de passe se change sur votre compte Scouts du Liban.',
        code: 'USE_KEYCLOAK',
      });
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and reset forcePasswordChange flag
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
        forcePasswordChange: false,
      },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;

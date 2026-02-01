import express from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { authLimiter, passwordChangeLimiter } from '../middleware/rateLimiter.js';
import { blacklistToken } from '../utils/tokenBlacklist.js';

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

// POST /api/auth/login - Login (rate limited)
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
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

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { hashPassword } from '../utils/auth.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { sensitiveLimiter } from '../middleware/rateLimiter.js';

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

// Get all users (ADMIN only)
router.get('/users', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Remove passwords from response
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);

    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all troupes for dropdown (ADMIN only)
router.get('/troupes', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const troupes = await prisma.troupe.findMany({
      include: {
        group: {
          include: {
            district: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(troupes);
  } catch (error) {
    console.error('Failed to fetch troupes:', error);
    res.status(500).json({ error: 'Failed to fetch troupes' });
  }
});

// Create new user (ADMIN only)
router.post('/users', authenticate, authorize('ADMIN'), sensitiveLimiter, async (req, res) => {
  try {
    const { email, password, role, troupeId, isActive } = req.body;
    const name = sanitizeInput(req.body.name);

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
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

    // Validate role
    const validRoles = ['ADMIN', 'CHEF_TROUPE', 'BRANCHE_ECLAIREURS'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Prepare user data
    const userData = {
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      isActive: isActive !== undefined ? isActive : true,
    };

    // Require troupeId for CHEF_TROUPE
    if (role === 'CHEF_TROUPE' && !troupeId) {
      return res.status(400).json({ error: 'Troupe is required for Chef Troupe role' });
    }

    // Validate and add troupeId if provided
    if (troupeId) {
      const troupe = await prisma.troupe.findUnique({ where: { id: parseInt(troupeId) } });
      if (!troupe) {
        return res.status(400).json({ error: 'Selected troupe does not exist' });
      }
      userData.troupeId = troupe.id;
    }

    const newUser = await prisma.user.create({
      data: userData,
      include: {
        troupe: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Failed to create user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (ADMIN only)
router.put('/users/:id', authenticate, authorize('ADMIN'), sensitiveLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, role, troupeId, isActive, forcePasswordChange } = req.body;
    const name = req.body.name ? sanitizeInput(req.body.name) : undefined;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is being changed and if it's already in use
    if (email && email !== existingUser.email) {
      const emailInUse = await prisma.user.findUnique({
        where: { email },
      });

      if (emailInUse) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    // Prepare update data
    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (forcePasswordChange !== undefined) updateData.forcePasswordChange = forcePasswordChange;

    // Update password if provided
    if (password && password.trim() !== '') {
      updateData.password = await hashPassword(password);
    }

    // Require troupeId for CHEF_TROUPE
    const effectiveRole = role || existingUser.role;
    if (effectiveRole === 'CHEF_TROUPE' && troupeId !== undefined && !troupeId) {
      return res.status(400).json({ error: 'Troupe is required for Chef Troupe role' });
    }
    if (effectiveRole === 'CHEF_TROUPE' && troupeId === undefined && !existingUser.troupeId) {
      return res.status(400).json({ error: 'Troupe is required for Chef Troupe role' });
    }

    // Validate and handle troupeId
    if (troupeId !== undefined) {
      if (troupeId) {
        const troupe = await prisma.troupe.findUnique({ where: { id: parseInt(troupeId) } });
        if (!troupe) {
          return res.status(400).json({ error: 'Selected troupe does not exist' });
        }
        updateData.troupeId = troupe.id;
      } else {
        updateData.troupeId = null;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
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
    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (ADMIN only)
router.delete('/users/:id', authenticate, authorize('ADMIN'), sensitiveLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (existingUser.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/dashboard-stats - Aggregated dashboard statistics (ADMIN only)
router.get('/dashboard-stats', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    // Run all queries in parallel
    const [
      users,
      neverLoggedIn,
      troupes,
      pictureSetsByTroupe,
      schematicsByTroupe,
    ] = await Promise.all([
      // User stats
      prisma.user.findMany({
        select: {
          id: true,
          role: true,
          isActive: true,
          lastLogin: true,
        },
      }),

      // Never logged in users (with org details)
      prisma.user.findMany({
        where: { lastLogin: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          troupe: {
            select: {
              name: true,
              group: {
                select: {
                  name: true,
                  district: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // All troupes with org info
      prisma.troupe.findMany({
        select: {
          id: true,
          name: true,
          group: {
            select: {
              name: true,
              district: { select: { name: true } },
            },
          },
          _count: {
            select: {
              users: true,
              patrouilles: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),

      // Picture sets (photos) grouped by troupe and status
      prisma.pictureSet.groupBy({
        by: ['troupeId', 'status'],
        where: { type: 'INSTALLATION_PHOTO' },
        _count: { id: true },
      }),

      // Schematics grouped by troupe and status
      prisma.pictureSet.groupBy({
        by: ['troupeId', 'status'],
        where: { type: 'SCHEMATIC' },
        _count: { id: true },
      }),
    ]);

    // Build user stats
    const userStats = {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      byRole: {
        ADMIN: users.filter(u => u.role === 'ADMIN').length,
        CHEF_TROUPE: users.filter(u => u.role === 'CHEF_TROUPE').length,
        BRANCHE_ECLAIREURS: users.filter(u => u.role === 'BRANCHE_ECLAIREURS').length,
      },
      neverLoggedIn: neverLoggedIn.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        district: u.troupe?.group?.district?.name || '',
        group: u.troupe?.group?.name || '',
        troupe: u.troupe?.name || '',
        createdAt: u.createdAt,
      })),
    };

    // Build helper to aggregate status counts per troupe
    const aggregateCounts = (groupedData) => {
      const map = {};
      for (const row of groupedData) {
        if (!row.troupeId) continue;
        if (!map[row.troupeId]) {
          map[row.troupeId] = { total: 0, pending: 0, classified: 0, approved: 0, rejected: 0 };
        }
        map[row.troupeId][row.status.toLowerCase()] = row._count.id;
        map[row.troupeId].total += row._count.id;
      }
      return map;
    };

    const photosByTroupe = aggregateCounts(pictureSetsByTroupe);
    const schemByTroupe = aggregateCounts(schematicsByTroupe);

    // Build troupe stats
    const troupeStats = troupes.map(t => ({
      id: t.id,
      name: t.name,
      group: t.group.name,
      district: t.group.district.name,
      users: t._count.users,
      patrouilles: t._count.patrouilles,
      photos: photosByTroupe[t.id] || { total: 0, pending: 0, classified: 0, approved: 0, rejected: 0 },
      schematics: schemByTroupe[t.id] || { total: 0, pending: 0, classified: 0, approved: 0, rejected: 0 },
    }));

    res.json({ userStats, troupeStats });
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/admin/troupe-comparison - Compare troupe upload status between two dates
router.get('/troupe-comparison', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { date1, date2 } = req.query;
    if (!date1 || !date2) {
      return res.status(400).json({ error: 'Both date1 and date2 are required' });
    }

    const d1 = new Date(date1);
    const d2 = new Date(date2);
    // Set to end of day for inclusive filtering
    d1.setHours(23, 59, 59, 999);
    d2.setHours(23, 59, 59, 999);

    // Get all troupes
    const troupes = await prisma.troupe.findMany({
      select: {
        id: true,
        name: true,
        group: {
          select: {
            name: true,
            district: { select: { name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get troupe IDs that had uploads as of date1 and date2
    const [uploadsAsOfDate1, uploadsAsOfDate2] = await Promise.all([
      prisma.pictureSet.groupBy({
        by: ['troupeId'],
        where: { uploadedAt: { lte: d1 } },
        _count: { id: true },
      }),
      prisma.pictureSet.groupBy({
        by: ['troupeId'],
        where: { uploadedAt: { lte: d2 } },
        _count: { id: true },
      }),
    ]);

    const troupeCountsDate1 = {};
    for (const row of uploadsAsOfDate1) {
      if (row.troupeId) troupeCountsDate1[row.troupeId] = row._count.id;
    }

    const troupeCountsDate2 = {};
    for (const row of uploadsAsOfDate2) {
      if (row.troupeId) troupeCountsDate2[row.troupeId] = row._count.id;
    }

    const results = troupes.map(t => {
      const countDate1 = troupeCountsDate1[t.id] || 0;
      const countDate2 = troupeCountsDate2[t.id] || 0;
      const zeroAtDate1 = countDate1 === 0;
      const zeroAtDate2 = countDate2 === 0;

      // Determine status relative to the comparison
      let status = null;
      if (zeroAtDate1 && zeroAtDate2) status = 'still_zero';
      else if (zeroAtDate1 && !zeroAtDate2) status = 'uploaded_between';
      // Not zero at date1 — not relevant to the comparison

      return {
        id: t.id,
        name: t.name,
        group: t.group.name,
        district: t.group.district.name,
        uploadsAtDate1: countDate1,
        uploadsAtDate2: countDate2,
        status,
      };
    });

    // Only include troupes that had zero at date1
    const comparison = results.filter(r => r.status !== null);

    res.json({
      date1: d1.toISOString(),
      date2: d2.toISOString(),
      summary: {
        zeroAtDate1: comparison.length,
        stillZero: comparison.filter(r => r.status === 'still_zero').length,
        uploadedBetween: comparison.filter(r => r.status === 'uploaded_between').length,
      },
      troupes: comparison,
    });
  } catch (error) {
    console.error('Failed to fetch troupe comparison:', error);
    res.status(500).json({ error: 'Failed to fetch troupe comparison' });
  }
});

// Get users who have never logged in (ADMIN only)
router.get('/users/never-logged-in', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        lastLogin: null,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format the response with only needed fields
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      district: user.troupe?.group?.district?.name || '',
      group: user.troupe?.group?.name || '',
      troupe: user.troupe?.name || '',
      createdAt: user.createdAt,
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Failed to fetch never-logged-in users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Bulk import users from Excel
router.post('/users/import', authenticate, authorize('ADMIN'), sensitiveLimiter, async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'Users array is required' });
    }

    const results = {
      success: [],
      errors: [],
      troupesNeeded: [],
    };

    for (let i = 0; i < users.length; i++) {
      const { name, email, password, role, district, group, troupe } = users[i];

      try {
        // Validate required fields
        if (!name || !email || !password || !role) {
          results.errors.push({
            row: i + 1,
            data: users[i],
            error: 'Name, email, password, and role are required',
          });
          continue;
        }

        // Validate role
        if (!['ADMIN', 'CHEF_TROUPE', 'BRANCHE_ECLAIREURS'].includes(role)) {
          results.errors.push({
            row: i + 1,
            data: users[i],
            error: 'Invalid role. Must be ADMIN, CHEF_TROUPE, or BRANCHE_ECLAIREURS',
          });
          continue;
        }

        // For CHEF_TROUPE, troupe is required
        let troupeId = null;
        if (role === 'CHEF_TROUPE') {
          if (!district || !group || !troupe) {
            results.errors.push({
              row: i + 1,
              data: users[i],
              error: 'District, Group, and Troupe are required for CHEF_TROUPE role',
            });
            continue;
          }

          // Find the district
          const districtRecord = await prisma.district.findFirst({
            where: {
              OR: [
                { name: district },
                { code: district },
              ],
            },
          });

          if (!districtRecord) {
            results.errors.push({
              row: i + 1,
              data: users[i],
              error: `District '${district}' not found`,
            });
            continue;
          }

          // Find the group
          const groupRecord = await prisma.group.findFirst({
            where: {
              districtId: districtRecord.id,
              OR: [
                { name: group },
                { code: group },
              ],
            },
          });

          if (!groupRecord) {
            results.troupesNeeded.push({
              row: i + 1,
              data: users[i],
              message: `Group '${group}' not found in district '${district}'`,
            });
            continue;
          }

          // Find the troupe
          const troupeRecord = await prisma.troupe.findFirst({
            where: {
              groupId: groupRecord.id,
              OR: [
                { name: troupe },
                { code: troupe },
              ],
            },
          });

          if (!troupeRecord) {
            results.troupesNeeded.push({
              row: i + 1,
              data: users[i],
              message: `Troupe '${troupe}' not found in group '${group}'`,
              suggestion: `Please create troupe: ${district} > ${group} > ${troupe}`,
            });
            continue;
          }

          troupeId = troupeRecord.id;
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          results.errors.push({
            row: i + 1,
            data: users[i],
            error: `User with email '${email}' already exists`,
          });
          continue;
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const created = await prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role,
            troupeId,
            isActive: true,
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

        // Remove password from result
        const { password: _, ...userWithoutPassword } = created;

        results.success.push({
          row: i + 1,
          user: userWithoutPassword,
          action: 'created',
        });
      } catch (error) {
        results.errors.push({
          row: i + 1,
          data: users[i],
          error: error.message,
        });
      }
    }

    res.json({
      message: `Processed ${users.length} users`,
      success: results.success.length,
      errors: results.errors.length,
      troupesNeeded: results.troupesNeeded.length,
      details: results,
    });
  } catch (error) {
    console.error('Failed to import users:', error);
    res.status(500).json({ error: 'Failed to import users' });
  }
});

export default router;

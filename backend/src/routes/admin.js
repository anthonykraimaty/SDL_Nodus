import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { hashPassword } from '../utils/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all users (ADMIN only)
router.get('/users', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        troupe: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all troupes for dropdown (ADMIN only)
router.get('/troupes', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const troupes = await prisma.troupe.findMany({
      select: {
        id: true,
        name: true,
        code: true,
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
router.post('/users', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role, troupeId, isActive } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Prepare user data
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      isActive: isActive !== undefined ? isActive : true,
    };

    // Add troupeId if provided
    if (troupeId) {
      userData.troupeId = parseInt(troupeId);
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
router.put('/users/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, troupeId, isActive } = req.body;

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

    // Update password if provided
    if (password && password.trim() !== '') {
      updateData.password = await hashPassword(password);
    }

    // Handle troupeId
    if (troupeId !== undefined) {
      updateData.troupeId = troupeId ? parseInt(troupeId) : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
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
    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (ADMIN only)
router.delete('/users/:id', authenticate, authorize('ADMIN'), async (req, res) => {
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

// Bulk import users from Excel
router.post('/users/import', authenticate, authorize('ADMIN'), async (req, res) => {
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

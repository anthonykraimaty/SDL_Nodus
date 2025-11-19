import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all users (admin only)
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
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
        districtAccess: {
          include: {
            district: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { name: 'asc' },
      ],
    });

    // Exclude passwords
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);

    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user with district access
router.get('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
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
        districtAccess: {
          include: {
            district: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Exclude password
    const { password, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user district access (admin only)
router.put('/:id/district-access', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { districtIds } = req.body;

    // Verify user exists and is BRANCHE_ECLAIREURS
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'BRANCHE_ECLAIREURS') {
      return res.status(400).json({
        error: 'District access can only be assigned to Branche Éclaireurs members'
      });
    }

    // Delete existing access
    await prisma.userDistrictAccess.deleteMany({
      where: { userId },
    });

    // Create new access if districtIds provided
    if (districtIds && districtIds.length > 0) {
      await prisma.userDistrictAccess.createMany({
        data: districtIds.map(districtId => ({
          userId,
          districtId: parseInt(districtId),
        })),
      });
    }

    // Return updated user with district access
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        districtAccess: {
          include: {
            district: true,
          },
        },
      },
    });

    const { password, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error updating district access:', error);
    res.status(500).json({ error: 'Failed to update district access' });
  }
});

// Get all Branche members with their district access
router.get('/branche/members', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const brancheMembers = await prisma.user.findMany({
      where: {
        role: 'BRANCHE_ECLAIREURS',
        isActive: true,
      },
      include: {
        districtAccess: {
          include: {
            district: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Exclude passwords
    const membersWithoutPasswords = brancheMembers.map(({ password, ...user }) => user);

    res.json(membersWithoutPasswords);
  } catch (error) {
    console.error('Error fetching Branche members:', error);
    res.status(500).json({ error: 'Failed to fetch Branche members' });
  }
});

export default router;

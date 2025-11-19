import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all troupes (with group and district)
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const troupes = await prisma.troupe.findMany({
      include: {
        group: {
          include: {
            district: true,
          },
        },
        patrouilles: true,
        users: true,
        _count: {
          select: {
            patrouilles: true,
            users: true,
            pictureSets: true,
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

// Get single troupe
router.get('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const troupe = await prisma.troupe.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        group: {
          include: {
            district: true,
          },
        },
        patrouilles: true,
        users: true,
      },
    });

    if (!troupe) {
      return res.status(404).json({ error: 'Troupe not found' });
    }

    res.json(troupe);
  } catch (error) {
    console.error('Failed to fetch troupe:', error);
    res.status(500).json({ error: 'Failed to fetch troupe' });
  }
});

// Create new troupe
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, code, groupId } = req.body;

    if (!name || !code || !groupId) {
      return res.status(400).json({ error: 'Name, code, and groupId are required' });
    }

    // Check if code already exists
    const existingTroupe = await prisma.troupe.findUnique({
      where: { code },
    });

    if (existingTroupe) {
      return res.status(400).json({ error: 'Troupe with this code already exists' });
    }

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id: parseInt(groupId) },
    });

    if (!group) {
      return res.status(400).json({ error: 'Group not found' });
    }

    const troupe = await prisma.troupe.create({
      data: {
        name,
        code,
        groupId: parseInt(groupId),
      },
      include: {
        group: {
          include: {
            district: true,
          },
        },
      },
    });

    res.status(201).json(troupe);
  } catch (error) {
    console.error('Failed to create troupe:', error);
    res.status(500).json({ error: 'Failed to create troupe' });
  }
});

// Update troupe
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, groupId } = req.body;

    const existingTroupe = await prisma.troupe.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingTroupe) {
      return res.status(404).json({ error: 'Troupe not found' });
    }

    // Check if code is being changed and if it's already in use
    if (code && code !== existingTroupe.code) {
      const codeInUse = await prisma.troupe.findUnique({
        where: { code },
      });

      if (codeInUse) {
        return res.status(400).json({ error: 'Code already in use' });
      }
    }

    // Verify group exists if being changed
    if (groupId) {
      const group = await prisma.group.findUnique({
        where: { id: parseInt(groupId) },
      });

      if (!group) {
        return res.status(400).json({ error: 'Group not found' });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (code) updateData.code = code;
    if (groupId) updateData.groupId = parseInt(groupId);

    const troupe = await prisma.troupe.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        group: {
          include: {
            district: true,
          },
        },
      },
    });

    res.json(troupe);
  } catch (error) {
    console.error('Failed to update troupe:', error);
    res.status(500).json({ error: 'Failed to update troupe' });
  }
});

// Delete troupe
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const existingTroupe = await prisma.troupe.findUnique({
      where: { id: parseInt(id) },
      include: {
        patrouilles: true,
        users: true,
      },
    });

    if (!existingTroupe) {
      return res.status(404).json({ error: 'Troupe not found' });
    }

    if (existingTroupe.patrouilles.length > 0 || existingTroupe.users.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete troupe with existing patrouilles or users. Remove them first.'
      });
    }

    await prisma.troupe.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Troupe deleted successfully' });
  } catch (error) {
    console.error('Failed to delete troupe:', error);
    res.status(500).json({ error: 'Failed to delete troupe' });
  }
});

// Bulk import troupes from Excel
router.post('/import', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { troupes } = req.body;

    if (!troupes || !Array.isArray(troupes) || troupes.length === 0) {
      return res.status(400).json({ error: 'Troupes array is required' });
    }

    const results = {
      success: [],
      errors: [],
    };

    for (let i = 0; i < troupes.length; i++) {
      const { name, code, district, group } = troupes[i];

      try {
        // Validate required fields
        if (!name || !code || !district || !group) {
          results.errors.push({
            row: i + 1,
            data: troupes[i],
            error: 'Name, code, district, and group are required',
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
            data: troupes[i],
            error: `District '${district}' not found`,
          });
          continue;
        }

        // Find or create the group
        let groupRecord = await prisma.group.findFirst({
          where: {
            districtId: districtRecord.id,
            OR: [
              { name: group },
              { code: group },
            ],
          },
        });

        if (!groupRecord) {
          // Auto-create group if it doesn't exist
          const groupCode = group.toUpperCase().replace(/\s+/g, '_');
          groupRecord = await prisma.group.create({
            data: {
              name: group,
              code: groupCode,
              districtId: districtRecord.id,
            },
          });
        }

        // Check if troupe with this code already exists
        const existing = await prisma.troupe.findUnique({
          where: { code },
        });

        if (existing) {
          // Update existing troupe
          const updated = await prisma.troupe.update({
            where: { code },
            data: {
              name,
              groupId: groupRecord.id,
            },
            include: {
              group: {
                include: {
                  district: true,
                },
              },
            },
          });
          results.success.push({
            row: i + 1,
            troupe: updated,
            action: 'updated',
          });
        } else {
          // Create new troupe
          const created = await prisma.troupe.create({
            data: {
              name,
              code,
              groupId: groupRecord.id,
            },
            include: {
              group: {
                include: {
                  district: true,
                },
              },
            },
          });
          results.success.push({
            row: i + 1,
            troupe: created,
            action: 'created',
          });
        }
      } catch (error) {
        results.errors.push({
          row: i + 1,
          data: troupes[i],
          error: error.message,
        });
      }
    }

    res.json({
      message: `Processed ${troupes.length} troupes`,
      success: results.success.length,
      errors: results.errors.length,
      details: results,
    });
  } catch (error) {
    console.error('Failed to import troupes:', error);
    res.status(500).json({ error: 'Failed to import troupes' });
  }
});

export default router;

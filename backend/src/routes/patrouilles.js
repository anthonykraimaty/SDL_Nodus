import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all patrouilles (with troupe, group, and district)
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const patrouilles = await prisma.patrouille.findMany({
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
        _count: {
          select: {
            pictureSets: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(patrouilles);
  } catch (error) {
    console.error('Failed to fetch patrouilles:', error);
    res.status(500).json({ error: 'Failed to fetch patrouilles' });
  }
});

// Get single patrouille
router.get('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const patrouille = await prisma.patrouille.findUnique({
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
      },
    });

    if (!patrouille) {
      return res.status(404).json({ error: 'Patrouille not found' });
    }

    res.json(patrouille);
  } catch (error) {
    console.error('Failed to fetch patrouille:', error);
    res.status(500).json({ error: 'Failed to fetch patrouille' });
  }
});

// Create new patrouille
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, totem, cri, troupeId } = req.body;

    if (!name || !totem || !cri || !troupeId) {
      return res.status(400).json({ error: 'Name, totem, cri, and troupeId are required' });
    }

    // Verify troupe exists
    const troupe = await prisma.troupe.findUnique({
      where: { id: parseInt(troupeId) },
    });

    if (!troupe) {
      return res.status(400).json({ error: 'Troupe not found' });
    }

    const patrouille = await prisma.patrouille.create({
      data: {
        name,
        totem,
        cri,
        troupeId: parseInt(troupeId),
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

    res.status(201).json(patrouille);
  } catch (error) {
    console.error('Failed to create patrouille:', error);
    res.status(500).json({ error: 'Failed to create patrouille' });
  }
});

// Update patrouille
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, totem, cri, troupeId } = req.body;

    const existingPatrouille = await prisma.patrouille.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingPatrouille) {
      return res.status(404).json({ error: 'Patrouille not found' });
    }

    // Verify troupe exists if being changed
    if (troupeId) {
      const troupe = await prisma.troupe.findUnique({
        where: { id: parseInt(troupeId) },
      });

      if (!troupe) {
        return res.status(400).json({ error: 'Troupe not found' });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (totem) updateData.totem = totem;
    if (cri) updateData.cri = cri;
    if (troupeId) updateData.troupeId = parseInt(troupeId);

    const patrouille = await prisma.patrouille.update({
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

    res.json(patrouille);
  } catch (error) {
    console.error('Failed to update patrouille:', error);
    res.status(500).json({ error: 'Failed to update patrouille' });
  }
});

// Delete patrouille
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const existingPatrouille = await prisma.patrouille.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            pictureSets: true,
          },
        },
      },
    });

    if (!existingPatrouille) {
      return res.status(404).json({ error: 'Patrouille not found' });
    }

    if (existingPatrouille._count.pictureSets > 0) {
      return res.status(400).json({
        error: 'Cannot delete patrouille with existing picture sets. Remove picture associations first.'
      });
    }

    await prisma.patrouille.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Patrouille deleted successfully' });
  } catch (error) {
    console.error('Failed to delete patrouille:', error);
    res.status(500).json({ error: 'Failed to delete patrouille' });
  }
});

// Bulk import patrouilles from Excel
router.post('/import', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { patrouilles } = req.body;

    if (!patrouilles || !Array.isArray(patrouilles) || patrouilles.length === 0) {
      return res.status(400).json({ error: 'Patrouilles array is required' });
    }

    const results = {
      success: [],
      errors: [],
    };

    for (let i = 0; i < patrouilles.length; i++) {
      const { name, totem, cri, troupe } = patrouilles[i];

      try {
        // Validate required fields
        if (!name || !totem || !cri || !troupe) {
          results.errors.push({
            row: i + 1,
            data: patrouilles[i],
            error: 'Name, totem, cri, and troupe are required',
          });
          continue;
        }

        // Find the troupe by name or code
        const troupeRecord = await prisma.troupe.findFirst({
          where: {
            OR: [
              { name: troupe },
              { code: troupe },
            ],
          },
          include: {
            group: {
              include: {
                district: true,
              },
            },
          },
        });

        if (!troupeRecord) {
          results.errors.push({
            row: i + 1,
            data: patrouilles[i],
            error: `Troupe '${troupe}' not found`,
          });
          continue;
        }

        // Check if patrouille already exists in this troupe
        const existing = await prisma.patrouille.findFirst({
          where: {
            name,
            troupeId: troupeRecord.id,
          },
        });

        if (existing) {
          // Update existing patrouille
          const updated = await prisma.patrouille.update({
            where: { id: existing.id },
            data: {
              totem,
              cri,
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
          results.success.push({
            row: i + 1,
            patrouille: updated,
            action: 'updated',
          });
        } else {
          // Create new patrouille
          const created = await prisma.patrouille.create({
            data: {
              name,
              totem,
              cri,
              troupeId: troupeRecord.id,
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
          results.success.push({
            row: i + 1,
            patrouille: created,
            action: 'created',
          });
        }
      } catch (error) {
        results.errors.push({
          row: i + 1,
          data: patrouilles[i],
          error: error.message,
        });
      }
    }

    res.json({
      message: `Processed ${patrouilles.length} patrouilles`,
      success: results.success.length,
      errors: results.errors.length,
      details: results,
    });
  } catch (error) {
    console.error('Failed to import patrouilles:', error);
    res.status(500).json({ error: 'Failed to import patrouilles' });
  }
});

export default router;

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all districts - Public gets limited data, authenticated gets full hierarchy
router.get('/', optionalAuth, async (req, res) => {
  try {
    // Authenticated users get full details including groups
    if (req.user) {
      const districts = await prisma.district.findMany({
        include: {
          groups: {
            orderBy: {
              name: 'asc',
            },
          },
          _count: {
            select: {
              groups: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });
      return res.json(districts);
    }

    // Public users get only names and codes (no hierarchy details)
    const districts = await prisma.district.findMany({
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(districts);
  } catch (error) {
    console.error('Failed to fetch districts:', error);
    res.status(500).json({ error: 'Failed to fetch districts' });
  }
});

// Get single district
router.get('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const district = await prisma.district.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        groups: {
          include: {
            troupes: true,
          },
        },
      },
    });

    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    res.json(district);
  } catch (error) {
    console.error('Failed to fetch district:', error);
    res.status(500).json({ error: 'Failed to fetch district' });
  }
});

// Create new district
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    // Check if code already exists
    const existingDistrict = await prisma.district.findUnique({
      where: { code },
    });

    if (existingDistrict) {
      return res.status(400).json({ error: 'District with this code already exists' });
    }

    const district = await prisma.district.create({
      data: {
        name,
        code,
      },
      include: {
        groups: true,
      },
    });

    res.status(201).json(district);
  } catch (error) {
    console.error('Failed to create district:', error);
    res.status(500).json({ error: 'Failed to create district' });
  }
});

// Update district
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;

    const existingDistrict = await prisma.district.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingDistrict) {
      return res.status(404).json({ error: 'District not found' });
    }

    // Check if code is being changed and if it's already in use
    if (code && code !== existingDistrict.code) {
      const codeInUse = await prisma.district.findUnique({
        where: { code },
      });

      if (codeInUse) {
        return res.status(400).json({ error: 'Code already in use' });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (code) updateData.code = code;

    const district = await prisma.district.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        groups: true,
      },
    });

    res.json(district);
  } catch (error) {
    console.error('Failed to update district:', error);
    res.status(500).json({ error: 'Failed to update district' });
  }
});

// Delete district
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const existingDistrict = await prisma.district.findUnique({
      where: { id: parseInt(id) },
      include: {
        groups: true,
      },
    });

    if (!existingDistrict) {
      return res.status(404).json({ error: 'District not found' });
    }

    if (existingDistrict.groups.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete district with existing groups. Delete groups first.'
      });
    }

    await prisma.district.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'District deleted successfully' });
  } catch (error) {
    console.error('Failed to delete district:', error);
    res.status(500).json({ error: 'Failed to delete district' });
  }
});

// Bulk import districts from Excel
router.post('/import', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { districts } = req.body;

    if (!districts || !Array.isArray(districts) || districts.length === 0) {
      return res.status(400).json({ error: 'Districts array is required' });
    }

    const results = {
      success: [],
      errors: [],
    };

    for (let i = 0; i < districts.length; i++) {
      const { name, code } = districts[i];

      try {
        // Validate required fields
        if (!name || !code) {
          results.errors.push({
            row: i + 1,
            data: districts[i],
            error: 'Name and code are required',
          });
          continue;
        }

        // Check if district with this code already exists
        const existing = await prisma.district.findUnique({
          where: { code },
        });

        if (existing) {
          // Update existing district
          const updated = await prisma.district.update({
            where: { code },
            data: { name },
          });
          results.success.push({
            row: i + 1,
            district: updated,
            action: 'updated',
          });
        } else {
          // Create new district
          const created = await prisma.district.create({
            data: {
              name,
              code,
            },
          });
          results.success.push({
            row: i + 1,
            district: created,
            action: 'created',
          });
        }
      } catch (error) {
        results.errors.push({
          row: i + 1,
          data: districts[i],
          error: error.message,
        });
      }
    }

    res.json({
      message: `Processed ${districts.length} districts`,
      success: results.success.length,
      errors: results.errors.length,
      details: results,
    });
  } catch (error) {
    console.error('Failed to import districts:', error);
    res.status(500).json({ error: 'Failed to import districts' });
  }
});

export default router;

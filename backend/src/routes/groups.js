import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/temp/' });

// GET /api/groups - Get all groups (public for filters)
router.get('/', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        district: true,
        _count: {
          select: {
            troupes: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(groups);
  } catch (error) {
    console.error('Failed to fetch groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /api/groups - Create new group (admin only)
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, code, districtId } = req.body;

    if (!name || !code || !districtId) {
      return res.status(400).json({ error: 'Name, code, and districtId are required' });
    }

    // Check if code already exists
    const existing = await prisma.group.findUnique({
      where: { code },
    });

    if (existing) {
      return res.status(400).json({ error: 'A group with this code already exists' });
    }

    // Verify district exists
    const district = await prisma.district.findUnique({
      where: { id: parseInt(districtId) },
    });

    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    const group = await prisma.group.create({
      data: {
        name,
        code,
        districtId: parseInt(districtId),
      },
      include: {
        district: true,
        _count: {
          select: {
            troupes: true,
          },
        },
      },
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Failed to create group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// PUT /api/groups/:id - Update group (admin only)
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, districtId } = req.body;

    // Check if group exists
    const existing = await prisma.group.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if new code conflicts with another group
    if (code && code !== existing.code) {
      const codeExists = await prisma.group.findUnique({
        where: { code },
      });

      if (codeExists) {
        return res.status(400).json({ error: 'A group with this code already exists' });
      }
    }

    // Verify district exists if being changed
    if (districtId) {
      const district = await prisma.district.findUnique({
        where: { id: parseInt(districtId) },
      });

      if (!district) {
        return res.status(404).json({ error: 'District not found' });
      }
    }

    const group = await prisma.group.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(code && { code }),
        ...(districtId && { districtId: parseInt(districtId) }),
      },
      include: {
        district: true,
        _count: {
          select: {
            troupes: true,
          },
        },
      },
    });

    res.json(group);
  } catch (error) {
    console.error('Failed to update group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// DELETE /api/groups/:id - Delete group (admin only)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if group exists
    const group = await prisma.group.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            troupes: true,
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Delete group (will cascade to troupes due to schema)
    await prisma.group.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Failed to delete group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// POST /api/groups/import - Import groups from CSV (admin only)
router.post('/import', authenticate, authorize('ADMIN'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fs = await import('fs');
    const csvData = fs.readFileSync(req.file.path, 'utf-8');
    const lines = csvData.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file is empty or invalid' });
    }

    // Skip header row
    const dataLines = lines.slice(1);
    let imported = 0;

    for (const line of dataLines) {
      const [name, code, districtCode] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));

      if (!name || !code || !districtCode) continue;

      // Find district by code
      const district = await prisma.district.findUnique({
        where: { code: districtCode },
      });

      if (!district) {
        console.warn(`District with code ${districtCode} not found, skipping group ${name}`);
        continue;
      }

      // Check if group already exists
      const existing = await prisma.group.findUnique({
        where: { code },
      });

      if (!existing) {
        await prisma.group.create({
          data: {
            name,
            code,
            districtId: district.id,
          },
        });
        imported++;
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ message: `Successfully imported ${imported} groups`, count: imported });
  } catch (error) {
    console.error('Failed to import groups:', error);
    res.status(500).json({ error: 'Failed to import groups' });
  }
});

export default router;

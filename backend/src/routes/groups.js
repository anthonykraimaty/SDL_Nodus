import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Secure multer configuration for CSV imports
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const csvFileFilter = (req, file, cb) => {
  // Only allow CSV files
  const allowedTypes = /csv|text\/csv|application\/vnd\.ms-excel/;
  const extname = /\.csv$/i.test(file.originalname);
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype || extname) {
    return cb(null, true);
  }
  cb(new Error('Only CSV files are allowed'));
};

const upload = multer({
  storage: csvStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: csvFileFilter,
});

// GET /api/groups - Public gets limited data, authenticated gets full details
router.get('/', optionalAuth, async (req, res) => {
  try {
    // Authenticated users get full details including district and troupe counts
    if (req.user) {
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
      return res.json(groups);
    }

    // Public users get only basic info (no hierarchy details)
    const groups = await prisma.group.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        districtId: true,
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
  const fs = await import('fs');
  const filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvData = fs.readFileSync(filePath, 'utf-8');
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

    res.json({ message: `Successfully imported ${imported} groups`, count: imported });
  } catch (error) {
    console.error('Failed to import groups:', error);
    res.status(500).json({ error: 'Failed to import groups' });
  } finally {
    // Always clean up uploaded file, even on error
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
  }
});

export default router;

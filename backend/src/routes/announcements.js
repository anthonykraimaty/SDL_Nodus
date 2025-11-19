import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/announcements - Get active announcements
router.get('/', async (req, res) => {
  try {
    const now = new Date();

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        OR: [
          { validTo: null },
          { validTo: { gte: now } },
        ],
      },
      orderBy: [
        { displayOrder: 'asc' },
        { validFrom: 'desc' },
      ],
    });

    res.json(announcements);
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// POST /api/announcements - Create announcement (admin only)
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { title, content, type, validFrom, validTo, displayOrder } = req.body;

    if (!title || !content || !type || !validFrom) {
      return res.status(400).json({
        error: 'Title, content, type, and validFrom are required',
      });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        type,
        validFrom: new Date(validFrom),
        validTo: validTo ? new Date(validTo) : null,
        displayOrder: displayOrder || 0,
      },
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

export default router;

import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

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

export default router;

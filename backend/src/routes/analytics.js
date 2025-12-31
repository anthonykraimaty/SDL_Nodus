import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/analytics/participation - Get participation stats
router.get('/participation', authenticate, async (req, res) => {
  try {
    const { groupId, troupeId } = req.query;

    // Build where clause based on user role
    const where = { status: 'APPROVED' };

    if (req.user.role === 'CHEF_TROUPE') {
      where.troupeId = req.user.troupeId;
    } else if (groupId) {
      where.troupe = { groupId: parseInt(groupId) };
    } else if (troupeId) {
      where.troupeId = parseInt(troupeId);
    }

    // Get participation by patrouille
    const patrouilleStats = await prisma.pictureSet.groupBy({
      by: ['patrouilleId'],
      where: {
        ...where,
        patrouilleId: { not: null },
      },
      _count: { id: true },
    });

    // Build patrouille filter based on user role
    const patrouilleWhere = {};
    if (req.user.role === 'CHEF_TROUPE') {
      // Chef Troupe can only see their own troupe's patrouilles
      patrouilleWhere.troupeId = req.user.troupeId;
    } else if (groupId) {
      patrouilleWhere.troupe = { groupId: parseInt(groupId) };
    } else if (troupeId) {
      patrouilleWhere.troupeId = parseInt(troupeId);
    }

    // Get patrouille details (filtered by role)
    const patrouilles = await prisma.patrouille.findMany({
      where: patrouilleWhere,
      include: {
        troupe: {
          include: { group: true },
        },
      },
    });

    const participationData = patrouilles.map(patrouille => {
      const stats = patrouilleStats.find(s => s.patrouilleId === patrouille.id);
      return {
        patrouille,
        pictureCount: stats?._count.id || 0,
        hasParticipated: (stats?._count.id || 0) > 0,
      };
    });

    res.json({
      participationData,
      summary: {
        totalPatrouilles: patrouilles.length,
        participatingPatrouilles: participationData.filter(p => p.hasParticipated).length,
        participationRate: (participationData.filter(p => p.hasParticipated).length / patrouilles.length) * 100,
      },
    });
  } catch (error) {
    console.error('Get participation error:', error);
    res.status(500).json({ error: 'Failed to fetch participation data' });
  }
});

// GET /api/analytics/pictures/stats - Get picture statistics
router.get('/pictures/stats', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const [total, pending, classified, approved, rejected, byType, byGroup] = await Promise.all([
      prisma.pictureSet.count(),
      prisma.pictureSet.count({ where: { status: 'PENDING' } }),
      prisma.pictureSet.count({ where: { status: 'CLASSIFIED' } }),
      prisma.pictureSet.count({ where: { status: 'APPROVED' } }),
      prisma.pictureSet.count({ where: { status: 'REJECTED' } }),
      prisma.pictureSet.groupBy({
        by: ['type'],
        _count: { id: true },
      }),
      prisma.pictureSet.groupBy({
        by: ['troupeId'],
        _count: { id: true },
        where: { status: 'APPROVED' },
      }),
    ]);

    res.json({
      total,
      byStatus: { pending, classified, approved, rejected },
      byType,
      groupCount: byGroup.length,
    });
  } catch (error) {
    console.error('Get picture stats error:', error);
    res.status(500).json({ error: 'Failed to fetch picture statistics' });
  }
});

export default router;

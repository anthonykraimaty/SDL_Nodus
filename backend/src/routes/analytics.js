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

// GET /api/analytics/sync-picture-categories - Check pictures needing category sync (admin only)
router.get('/sync-picture-categories', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    // Find pictures where categoryId is null but their pictureSet has a categoryId
    const picturesToSync = await prisma.picture.findMany({
      where: {
        categoryId: null,
        pictureSet: {
          categoryId: { not: null }
        }
      },
      include: {
        pictureSet: {
          select: {
            id: true,
            title: true,
            categoryId: true,
            category: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    // Group by picture set for better display
    const setMap = new Map();
    for (const pic of picturesToSync) {
      const setId = pic.pictureSet.id;
      if (!setMap.has(setId)) {
        setMap.set(setId, {
          id: setId,
          title: pic.pictureSet.title,
          categoryId: pic.pictureSet.categoryId,
          categoryName: pic.pictureSet.category?.name,
          pictureCount: 0
        });
      }
      setMap.get(setId).pictureCount++;
    }

    res.json({
      totalPictures: picturesToSync.length,
      sets: Array.from(setMap.values())
    });
  } catch (error) {
    console.error('Check picture categories sync error:', error);
    res.status(500).json({ error: 'Failed to check picture categories' });
  }
});

// POST /api/analytics/sync-picture-categories - Sync picture categories from their sets (admin only)
router.post('/sync-picture-categories', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    // Find all picture sets that have a categoryId
    const setsWithCategory = await prisma.pictureSet.findMany({
      where: {
        categoryId: { not: null }
      },
      select: {
        id: true,
        categoryId: true
      }
    });

    let totalUpdated = 0;
    const updatedSets = [];

    for (const set of setsWithCategory) {
      // Update all pictures in this set that don't have a categoryId
      const result = await prisma.picture.updateMany({
        where: {
          pictureSetId: set.id,
          categoryId: null
        },
        data: {
          categoryId: set.categoryId
        }
      });

      if (result.count > 0) {
        totalUpdated += result.count;
        updatedSets.push({
          setId: set.id,
          categoryId: set.categoryId,
          picturesUpdated: result.count
        });
      }
    }

    res.json({
      message: `Synced ${totalUpdated} picture(s) across ${updatedSets.length} set(s)`,
      totalUpdated,
      updatedSets
    });
  } catch (error) {
    console.error('Sync picture categories error:', error);
    res.status(500).json({ error: 'Failed to sync picture categories' });
  }
});

// GET /api/analytics/sync-picture-types - Check pictures needing type sync (admin only)
router.get('/sync-picture-types', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    // Use raw SQL to count pictures needing sync (bypasses Prisma client caching)
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Picture" p
      JOIN "PictureSet" ps ON p."pictureSetId" = ps.id
      WHERE p.type IS NULL AND ps.type IS NOT NULL
    `;

    const totalPictures = Number(countResult[0]?.count || 0);

    // Get sample sets that need syncing
    const setsResult = await prisma.$queryRaw`
      SELECT DISTINCT ps.id, ps.title, ps.type, COUNT(p.id) as picture_count
      FROM "PictureSet" ps
      JOIN "Picture" p ON p."pictureSetId" = ps.id
      WHERE p.type IS NULL AND ps.type IS NOT NULL
      GROUP BY ps.id, ps.title, ps.type
      LIMIT 20
    `;

    const sets = setsResult.map(row => ({
      id: row.id,
      title: row.title,
      type: row.type,
      pictureCount: Number(row.picture_count)
    }));

    res.json({
      totalPictures,
      sets
    });
  } catch (error) {
    console.error('Check picture types sync error:', error);
    res.status(500).json({ error: 'Failed to check picture types' });
  }
});

// POST /api/analytics/sync-picture-types - Sync picture types from their sets (admin only)
router.post('/sync-picture-types', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    // Use raw SQL to update all pictures that have null type but their set has a type
    // This bypasses any Prisma client caching issues
    const result = await prisma.$executeRaw`
      UPDATE "Picture" p
      SET type = ps.type
      FROM "PictureSet" ps
      WHERE p."pictureSetId" = ps.id
        AND p.type IS NULL
        AND ps.type IS NOT NULL
    `;

    res.json({
      message: `Synced ${result} picture(s)`,
      totalUpdated: result,
    });
  } catch (error) {
    console.error('Sync picture types error:', error);
    res.status(500).json({ error: 'Failed to sync picture types' });
  }
});

// GET /api/analytics/picture-type-debug - Debug picture types (admin only)
router.get('/picture-type-debug', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    // Count pictures by type
    const typeStats = await prisma.picture.groupBy({
      by: ['type'],
      _count: { id: true },
    });

    // Count pictures in approved picture sets
    const approvedPictureCount = await prisma.picture.count({
      where: {
        pictureSet: { status: 'APPROVED' },
      },
    });

    // Count pictures with INSTALLATION_PHOTO type in approved sets
    const photoCount = await prisma.picture.count({
      where: {
        type: 'INSTALLATION_PHOTO',
        pictureSet: { status: 'APPROVED' },
      },
    });

    // Count pictures with categoryId set
    const withCategory = await prisma.picture.count({
      where: {
        categoryId: { not: null },
        pictureSet: { status: 'APPROVED' },
      },
    });

    // Sample some pictures to see their actual values
    const samplePictures = await prisma.picture.findMany({
      take: 10,
      where: {
        pictureSet: { status: 'APPROVED' },
      },
      select: {
        id: true,
        type: true,
        categoryId: true,
        pictureSet: {
          select: {
            id: true,
            type: true,
            categoryId: true,
            status: true,
          },
        },
      },
    });

    res.json({
      typeStats,
      approvedPictureCount,
      photoCount,
      withCategory,
      samplePictures,
    });
  } catch (error) {
    console.error('Picture type debug error:', error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

// GET /api/analytics/pictures/by-category - Get individual picture counts per category
router.get('/pictures/by-category', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { status } = req.query;

    // Build where clause for pictures: non-archived, with a category
    const pictureWhere = {
      isArchived: false,
      categoryId: { not: null },
    };

    // Filter by PictureSet status if provided
    if (status) {
      pictureWhere.pictureSet = { status };
    }

    // District-based filtering for BRANCHE_ECLAIREURS
    if (req.user.role === 'BRANCHE_ECLAIREURS') {
      const userDistrictAccess = await prisma.userDistrictAccess.findMany({
        where: { userId: req.user.id },
        select: { districtId: true },
      });
      const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
      if (allowedDistrictIds.length === 0) {
        return res.json({ categories: [] });
      }
      pictureWhere.pictureSet = {
        ...pictureWhere.pictureSet,
        troupe: { group: { districtId: { in: allowedDistrictIds } } },
      };
    }

    // Group pictures by categoryId and count
    const grouped = await prisma.picture.groupBy({
      by: ['categoryId'],
      where: pictureWhere,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    });

    // Fetch category names
    const categoryIds = grouped.map(g => g.categoryId);
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const result = grouped.map(g => ({
      name: categoryMap[g.categoryId] || 'Unknown',
      count: g._count.id,
    }));

    res.json({ categories: result });
  } catch (error) {
    console.error('Get pictures by category error:', error);
    res.status(500).json({ error: 'Failed to fetch pictures by category' });
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

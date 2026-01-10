import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadToR2, isR2Configured, deleteFromR2 } from '../services/r2Storage.js';

const router = express.Router();
const prisma = new PrismaClient();

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

// GET /api/schematics/categories - Get all schematic categories (sets with items)
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.schematicCategory.findMany({
      orderBy: [{ setOrder: 'asc' }, { itemOrder: 'asc' }],
    });

    // Group by setName
    const sets = categories.reduce((acc, cat) => {
      if (!acc[cat.setName]) {
        acc[cat.setName] = {
          setName: cat.setName,
          setOrder: cat.setOrder,
          items: [],
        };
      }
      acc[cat.setName].items.push({
        id: cat.id,
        itemName: cat.itemName,
        itemOrder: cat.itemOrder,
      });
      return acc;
    }, {});

    // Convert to array and sort
    const result = Object.values(sets).sort((a, b) => a.setOrder - b.setOrder);

    res.json(result);
  } catch (error) {
    console.error('Error fetching schematic categories:', error);
    res.status(500).json({ error: 'Failed to fetch schematic categories' });
  }
});

// GET /api/schematics/gallery - Get approved schematics for public view
router.get('/gallery', async (req, res) => {
  try {
    const { setName, itemId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      type: 'SCHEMATIC',
      status: 'APPROVED',
      schematicCategoryId: { not: null },
    };

    if (itemId) {
      where.schematicCategoryId = parseInt(itemId);
    } else if (setName) {
      const categoryIds = await prisma.schematicCategory.findMany({
        where: { setName },
        select: { id: true },
      });
      where.schematicCategoryId = { in: categoryIds.map((c) => c.id) };
    }

    const [schematics, total] = await Promise.all([
      prisma.pictureSet.findMany({
        where,
        include: {
          pictures: { take: 1, orderBy: { displayOrder: 'asc' } },
          schematicCategory: true,
          patrouille: {
            include: {
              troupe: {
                include: {
                  group: {
                    include: { district: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { approvedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.pictureSet.count({ where }),
    ]);

    res.json({
      schematics,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching schematic gallery:', error);
    res.status(500).json({ error: 'Failed to fetch schematic gallery' });
  }
});

// ==========================================
// AUTHENTICATED ENDPOINTS
// ==========================================

// NOTE: More specific routes (/progress/troupe/:id, /progress/all) MUST be defined
// BEFORE the generic /progress/:patrouilleId route to avoid Express route conflicts

// GET /api/schematics/progress/troupe/:troupeId - Get progress for all patrouilles in troupe
router.get('/progress/troupe/:troupeId', authenticate, async (req, res) => {
  try {
    const { troupeId } = req.params;
    const user = req.user;

    // Authorization check
    if (user.role === 'CHEF_TROUPE' && user.troupeId !== parseInt(troupeId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get troupe with patrouilles
    const troupe = await prisma.troupe.findUnique({
      where: { id: parseInt(troupeId) },
      include: {
        patrouilles: true,
        group: { include: { district: true } },
      },
    });

    if (!troupe) {
      return res.status(404).json({ error: 'Troupe not found' });
    }

    // Get all categories count
    const totalItems = await prisma.schematicCategory.count();

    // Get progress for all patrouilles
    const progressData = await Promise.all(
      troupe.patrouilles.map(async (patrouille) => {
        const approvedCount = await prisma.schematicProgress.count({
          where: {
            patrouilleId: patrouille.id,
            status: 'APPROVED',
          },
        });

        const submittedCount = await prisma.schematicProgress.count({
          where: {
            patrouilleId: patrouille.id,
            status: 'SUBMITTED',
          },
        });

        return {
          patrouille,
          completedItems: approvedCount,
          pendingReview: submittedCount,
          totalItems,
          completionPercentage: Math.round((approvedCount / totalItems) * 100),
          isWinner: approvedCount === totalItems,
        };
      })
    );

    res.json({
      troupe,
      patrouilles: progressData.sort(
        (a, b) => b.completionPercentage - a.completionPercentage
      ),
    });
  } catch (error) {
    console.error('Error fetching troupe progress:', error);
    res.status(500).json({ error: 'Failed to fetch troupe progress' });
  }
});

// GET /api/schematics/progress/all - Get progress for all patrouilles (Branche/Admin)
router.get(
  '/progress/all',
  authenticate,
  authorize('BRANCHE_ECLAIREURS', 'ADMIN'),
  async (req, res) => {
    try {
      const { groupId, districtId } = req.query;

      // Build filter for patrouilles
      const patrouilleWhere = {};
      if (groupId) {
        patrouilleWhere.troupe = { groupId: parseInt(groupId) };
      }
      if (districtId) {
        patrouilleWhere.troupe = {
          ...patrouilleWhere.troupe,
          group: { districtId: parseInt(districtId) },
        };
      }

      const patrouilles = await prisma.patrouille.findMany({
        where: patrouilleWhere,
        include: {
          troupe: {
            include: {
              group: { include: { district: true } },
            },
          },
        },
      });

      const totalItems = await prisma.schematicCategory.count();

      const progressData = await Promise.all(
        patrouilles.map(async (patrouille) => {
          const approvedCount = await prisma.schematicProgress.count({
            where: {
              patrouilleId: patrouille.id,
              status: 'APPROVED',
            },
          });

          const submittedCount = await prisma.schematicProgress.count({
            where: {
              patrouilleId: patrouille.id,
              status: 'SUBMITTED',
            },
          });

          return {
            patrouille,
            completedItems: approvedCount,
            pendingReview: submittedCount,
            totalItems,
            completionPercentage: Math.round((approvedCount / totalItems) * 100),
            isWinner: approvedCount === totalItems,
          };
        })
      );

      res.json({
        patrouilles: progressData.sort(
          (a, b) => b.completionPercentage - a.completionPercentage
        ),
        totalItems,
      });
    } catch (error) {
      console.error('Error fetching all progress:', error);
      res.status(500).json({ error: 'Failed to fetch progress' });
    }
  }
);

// GET /api/schematics/progress/:patrouilleId - Get progress for one patrouille
// NOTE: This generic route MUST be after the more specific routes above
router.get('/progress/:patrouilleId', authenticate, async (req, res) => {
  try {
    const { patrouilleId } = req.params;
    const user = req.user;

    // Get patrouille with troupe info
    const patrouille = await prisma.patrouille.findUnique({
      where: { id: parseInt(patrouilleId) },
      include: {
        troupe: {
          include: {
            group: { include: { district: true } },
          },
        },
      },
    });

    if (!patrouille) {
      return res.status(404).json({ error: 'Patrouille not found' });
    }

    // Authorization check
    if (user.role === 'CHEF_TROUPE' && user.troupeId !== patrouille.troupeId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all schematic categories
    const allCategories = await prisma.schematicCategory.findMany({
      orderBy: [{ setOrder: 'asc' }, { itemOrder: 'asc' }],
    });

    // Get progress records for this patrouille
    const progressRecords = await prisma.schematicProgress.findMany({
      where: { patrouilleId: parseInt(patrouilleId) },
      include: {
        pictureSet: {
          include: {
            pictures: { take: 1, orderBy: { displayOrder: 'asc' } },
          },
        },
      },
    });

    // Create a map for quick lookup
    const progressMap = new Map(progressRecords.map((p) => [p.schematicCategoryId, p]));

    // Group by set with progress info
    const sets = {};
    for (const cat of allCategories) {
      if (!sets[cat.setName]) {
        sets[cat.setName] = {
          setName: cat.setName,
          setOrder: cat.setOrder,
          items: [],
          completedItems: 0,
          totalItems: 0,
        };
      }

      const progress = progressMap.get(cat.id);
      const item = {
        id: cat.id,
        itemName: cat.itemName,
        itemOrder: cat.itemOrder,
        status: progress?.status || 'PENDING',
        pictureSet: progress?.pictureSet || null,
        completedAt: progress?.completedAt || null,
      };

      sets[cat.setName].items.push(item);
      sets[cat.setName].totalItems++;
      if (item.status === 'APPROVED') {
        sets[cat.setName].completedItems++;
      }
    }

    // Calculate set completion
    const setsArray = Object.values(sets)
      .sort((a, b) => a.setOrder - b.setOrder)
      .map((set) => ({
        ...set,
        isComplete: set.completedItems === set.totalItems,
      }));

    const completedSets = setsArray.filter((s) => s.isComplete).length;
    const totalSets = setsArray.length;

    res.json({
      patrouille,
      sets: setsArray,
      completedSets,
      totalSets,
      isWinner: completedSets === totalSets,
      completionPercentage: Math.round(
        (setsArray.reduce((sum, s) => sum + s.completedItems, 0) /
          setsArray.reduce((sum, s) => sum + s.totalItems, 0)) *
          100
      ),
    });
  } catch (error) {
    console.error('Error fetching patrouille progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// ==========================================
// CHEF TROUPE ENDPOINTS
// ==========================================

// POST /api/schematics/upload - Upload a schematic
router.post(
  '/upload',
  authenticate,
  authorize('CHEF_TROUPE'),
  upload.array('pictures', 10),
  async (req, res) => {
    try {
      const { patrouilleId, schematicCategoryId } = req.body;
      const user = req.user;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      if (!patrouilleId || !schematicCategoryId) {
        return res
          .status(400)
          .json({ error: 'Patrouille and schematic category are required' });
      }

      // Validate patrouille belongs to user's troupe
      const patrouille = await prisma.patrouille.findUnique({
        where: { id: parseInt(patrouilleId) },
        include: { troupe: true },
      });

      if (!patrouille) {
        return res.status(404).json({ error: 'Patrouille not found' });
      }

      if (patrouille.troupeId !== user.troupeId) {
        return res
          .status(403)
          .json({ error: 'Patrouille does not belong to your troupe' });
      }

      // Validate schematic category exists
      const schematicCategory = await prisma.schematicCategory.findUnique({
        where: { id: parseInt(schematicCategoryId) },
      });

      if (!schematicCategory) {
        return res.status(404).json({ error: 'Schematic category not found' });
      }

      // Check if this item is already approved for this patrouille
      const existingApproved = await prisma.schematicProgress.findFirst({
        where: {
          patrouilleId: parseInt(patrouilleId),
          schematicCategoryId: parseInt(schematicCategoryId),
          status: 'APPROVED',
        },
      });

      if (existingApproved) {
        return res.status(400).json({
          error: 'This item has already been approved for this patrouille',
        });
      }

      // Compute image hash for duplicate detection
      const firstFileBuffer = files[0].buffer;
      const imageHash = crypto.createHash('md5').update(firstFileBuffer).digest('hex');

      // Check for duplicate hash in same troupe (different patrouille)
      const duplicateInTroupe = await prisma.pictureSet.findFirst({
        where: {
          imageHash,
          troupeId: user.troupeId,
          patrouilleId: { not: parseInt(patrouilleId) },
          type: 'SCHEMATIC',
        },
        include: {
          patrouille: true,
        },
      });

      if (duplicateInTroupe) {
        return res.status(400).json({
          error: `This image appears to be a duplicate. It was already uploaded for patrouille "${duplicateInTroupe.patrouille?.name || 'Unknown'}"`,
          duplicatePatrouille: duplicateInTroupe.patrouille?.name,
        });
      }

      // Upload files to storage
      const uploadedPictures = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let filePath;

        if (isR2Configured()) {
          const result = await uploadToR2(file.buffer, file.originalname, file.mimetype);
          filePath = result.url;
        } else {
          // Local storage fallback
          const fs = await import('fs/promises');
          const path = await import('path');
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const uploadDir = path.join(
            process.cwd(),
            'uploads',
            'schematics',
            String(year),
            month
          );
          await fs.mkdir(uploadDir, { recursive: true });
          const uniqueName = `${crypto.randomBytes(16).toString('hex')}${path.extname(
            file.originalname
          )}`;
          filePath = `/uploads/schematics/${year}/${month}/${uniqueName}`;
          await fs.writeFile(path.join(uploadDir, uniqueName), file.buffer);
        }

        uploadedPictures.push({
          filePath,
          displayOrder: i,
        });
      }

      // Generate title
      const title = `${patrouille.troupe.name}_${patrouille.name}_${schematicCategory.itemName}`;

      // Create picture set
      const pictureSet = await prisma.pictureSet.create({
        data: {
          title,
          type: 'SCHEMATIC',
          status: 'PENDING',
          uploadedById: user.id,
          troupeId: user.troupeId,
          patrouilleId: parseInt(patrouilleId),
          schematicCategoryId: parseInt(schematicCategoryId),
          imageHash,
          pictures: {
            create: uploadedPictures,
          },
        },
        include: {
          pictures: true,
          schematicCategory: true,
          patrouille: true,
        },
      });

      // Create or update progress record
      await prisma.schematicProgress.upsert({
        where: {
          patrouilleId_schematicCategoryId: {
            patrouilleId: parseInt(patrouilleId),
            schematicCategoryId: parseInt(schematicCategoryId),
          },
        },
        update: {
          status: 'SUBMITTED',
          pictureSetId: pictureSet.id,
        },
        create: {
          patrouilleId: parseInt(patrouilleId),
          schematicCategoryId: parseInt(schematicCategoryId),
          status: 'SUBMITTED',
          pictureSetId: pictureSet.id,
        },
      });

      res.status(201).json({
        message: 'Schematic uploaded successfully',
        pictureSet,
      });
    } catch (error) {
      console.error('Error uploading schematic:', error);
      res.status(500).json({ error: 'Failed to upload schematic' });
    }
  }
);

// ==========================================
// BRANCHE/ADMIN ENDPOINTS
// ==========================================

// GET /api/schematics/pending - Get pending schematics for review
router.get(
  '/pending',
  authenticate,
  authorize('BRANCHE_ECLAIREURS', 'ADMIN'),
  async (req, res) => {
    try {
      const { setName, troupeId, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const where = {
        type: 'SCHEMATIC',
        status: 'PENDING',
        schematicCategoryId: { not: null },
      };

      if (setName) {
        const categoryIds = await prisma.schematicCategory.findMany({
          where: { setName },
          select: { id: true },
        });
        where.schematicCategoryId = { in: categoryIds.map((c) => c.id) };
      }

      if (troupeId) {
        where.troupeId = parseInt(troupeId);
      }

      const [schematics, total] = await Promise.all([
        prisma.pictureSet.findMany({
          where,
          include: {
            pictures: true,
            schematicCategory: true,
            patrouille: true,
            uploadedBy: { select: { id: true, name: true, email: true } },
            troupe: {
              include: {
                group: { include: { district: true } },
              },
            },
          },
          orderBy: { uploadedAt: 'asc' }, // Oldest first for FIFO review
          skip,
          take: parseInt(limit),
        }),
        prisma.pictureSet.count({ where }),
      ]);

      res.json({
        schematics,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching pending schematics:', error);
      res.status(500).json({ error: 'Failed to fetch pending schematics' });
    }
  }
);

// POST /api/schematics/:id/approve - Approve a schematic
router.post(
  '/:id/approve',
  authenticate,
  authorize('BRANCHE_ECLAIREURS', 'ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user;

      const pictureSet = await prisma.pictureSet.findUnique({
        where: { id: parseInt(id) },
        include: {
          schematicCategory: true,
          patrouille: true,
        },
      });

      if (!pictureSet) {
        return res.status(404).json({ error: 'Schematic not found' });
      }

      if (pictureSet.type !== 'SCHEMATIC') {
        return res.status(400).json({ error: 'This is not a schematic' });
      }

      if (pictureSet.status !== 'PENDING') {
        return res.status(400).json({ error: 'Schematic is not pending review' });
      }

      // Update picture set
      const updatedPictureSet = await prisma.pictureSet.update({
        where: { id: parseInt(id) },
        data: {
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: {
          schematicCategory: true,
          patrouille: true,
        },
      });

      // Update progress record
      await prisma.schematicProgress.update({
        where: {
          patrouilleId_schematicCategoryId: {
            patrouilleId: pictureSet.patrouilleId,
            schematicCategoryId: pictureSet.schematicCategoryId,
          },
        },
        data: {
          status: 'APPROVED',
          completedAt: new Date(),
        },
      });

      // Check if patrouille completed a set or all sets
      const totalItems = await prisma.schematicCategory.count();
      const approvedCount = await prisma.schematicProgress.count({
        where: {
          patrouilleId: pictureSet.patrouilleId,
          status: 'APPROVED',
        },
      });

      // Check set completion
      const setCategories = await prisma.schematicCategory.findMany({
        where: { setName: pictureSet.schematicCategory.setName },
      });

      const setApprovedCount = await prisma.schematicProgress.count({
        where: {
          patrouilleId: pictureSet.patrouilleId,
          schematicCategoryId: { in: setCategories.map((c) => c.id) },
          status: 'APPROVED',
        },
      });

      const setComplete = setApprovedCount === setCategories.length;
      const allComplete = approvedCount === totalItems;

      res.json({
        message: 'Schematic approved successfully',
        pictureSet: updatedPictureSet,
        progress: {
          setComplete,
          setName: pictureSet.schematicCategory.setName,
          allComplete,
          isWinner: allComplete,
          completedItems: approvedCount,
          totalItems,
        },
      });
    } catch (error) {
      console.error('Error approving schematic:', error);
      res.status(500).json({ error: 'Failed to approve schematic' });
    }
  }
);

// POST /api/schematics/:id/reject - Reject a schematic
router.post(
  '/:id/reject',
  authenticate,
  authorize('BRANCHE_ECLAIREURS', 'ADMIN'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const user = req.user;

      if (!reason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }

      const pictureSet = await prisma.pictureSet.findUnique({
        where: { id: parseInt(id) },
        include: {
          schematicCategory: true,
          patrouille: true,
        },
      });

      if (!pictureSet) {
        return res.status(404).json({ error: 'Schematic not found' });
      }

      if (pictureSet.type !== 'SCHEMATIC') {
        return res.status(400).json({ error: 'This is not a schematic' });
      }

      if (pictureSet.status !== 'PENDING') {
        return res.status(400).json({ error: 'Schematic is not pending review' });
      }

      // Update picture set
      const updatedPictureSet = await prisma.pictureSet.update({
        where: { id: parseInt(id) },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: {
          schematicCategory: true,
          patrouille: true,
        },
      });

      // Update progress record
      await prisma.schematicProgress.update({
        where: {
          patrouilleId_schematicCategoryId: {
            patrouilleId: pictureSet.patrouilleId,
            schematicCategoryId: pictureSet.schematicCategoryId,
          },
        },
        data: {
          status: 'REJECTED',
          pictureSetId: null, // Clear the link so they can re-upload
        },
      });

      res.json({
        message: 'Schematic rejected',
        pictureSet: updatedPictureSet,
      });
    } catch (error) {
      console.error('Error rejecting schematic:', error);
      res.status(500).json({ error: 'Failed to reject schematic' });
    }
  }
);

// DELETE /api/schematics/:id - Delete a schematic (owner or admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(id) },
      include: { pictures: true },
    });

    if (!pictureSet) {
      return res.status(404).json({ error: 'Schematic not found' });
    }

    // Authorization: owner can delete pending/rejected, admin can delete anything
    const isOwner = pictureSet.uploadedById === user.id;
    const isAdmin = user.role === 'ADMIN';
    const canDelete =
      isAdmin || (isOwner && ['PENDING', 'REJECTED'].includes(pictureSet.status));

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this schematic' });
    }

    // Delete files from storage
    if (isR2Configured()) {
      for (const picture of pictureSet.pictures) {
        try {
          await deleteFromR2(picture.filePath);
        } catch (err) {
          console.error('Failed to delete file from R2:', err);
        }
      }
    }

    // Delete progress record if exists
    if (pictureSet.patrouilleId && pictureSet.schematicCategoryId) {
      await prisma.schematicProgress.deleteMany({
        where: {
          patrouilleId: pictureSet.patrouilleId,
          schematicCategoryId: pictureSet.schematicCategoryId,
          pictureSetId: pictureSet.id,
        },
      });
    }

    // Delete picture set (cascades to pictures)
    await prisma.pictureSet.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Schematic deleted successfully' });
  } catch (error) {
    console.error('Error deleting schematic:', error);
    res.status(500).json({ error: 'Failed to delete schematic' });
  }
});

// GET /api/schematics/stats - Get schematic statistics for dashboard
router.get('/stats', authenticate, async (req, res) => {
  try {
    const user = req.user;

    let where = { type: 'SCHEMATIC', schematicCategoryId: { not: null } };

    // Filter by user's troupe for Chef Troupe
    if (user.role === 'CHEF_TROUPE') {
      where.troupeId = user.troupeId;
    }

    const [pending, approved, rejected, total] = await Promise.all([
      prisma.pictureSet.count({ where: { ...where, status: 'PENDING' } }),
      prisma.pictureSet.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.pictureSet.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.pictureSet.count({ where }),
    ]);

    res.json({
      pending,
      approved,
      rejected,
      total,
    });
  } catch (error) {
    console.error('Error fetching schematic stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/schematics/stats/by-category - Get schematic counts by category (Branche/Admin)
router.get(
  '/stats/by-category',
  authenticate,
  authorize('BRANCHE_ECLAIREURS', 'ADMIN'),
  async (req, res) => {
    try {
      // Get all schematic categories grouped by setName
      const categories = await prisma.schematicCategory.findMany({
        orderBy: [{ setOrder: 'asc' }, { itemOrder: 'asc' }],
      });

      // Get counts for each category
      const categoryStats = await Promise.all(
        categories.map(async (cat) => {
          const [total, approved, pending, rejected] = await Promise.all([
            prisma.pictureSet.count({
              where: {
                type: 'SCHEMATIC',
                schematicCategoryId: cat.id,
              },
            }),
            prisma.pictureSet.count({
              where: {
                type: 'SCHEMATIC',
                schematicCategoryId: cat.id,
                status: 'APPROVED',
              },
            }),
            prisma.pictureSet.count({
              where: {
                type: 'SCHEMATIC',
                schematicCategoryId: cat.id,
                status: 'PENDING',
              },
            }),
            prisma.pictureSet.count({
              where: {
                type: 'SCHEMATIC',
                schematicCategoryId: cat.id,
                status: 'REJECTED',
              },
            }),
          ]);

          return {
            id: cat.id,
            setName: cat.setName,
            itemName: cat.itemName,
            setOrder: cat.setOrder,
            itemOrder: cat.itemOrder,
            total,
            approved,
            pending,
            rejected,
          };
        })
      );

      // Group by setName for easier display
      const bySet = categoryStats.reduce((acc, cat) => {
        if (!acc[cat.setName]) {
          acc[cat.setName] = {
            setName: cat.setName,
            setOrder: cat.setOrder,
            items: [],
            totalUploads: 0,
            totalApproved: 0,
            totalPending: 0,
          };
        }
        acc[cat.setName].items.push(cat);
        acc[cat.setName].totalUploads += cat.total;
        acc[cat.setName].totalApproved += cat.approved;
        acc[cat.setName].totalPending += cat.pending;
        return acc;
      }, {});

      const sets = Object.values(bySet).sort((a, b) => a.setOrder - b.setOrder);

      res.json({
        sets,
        categories: categoryStats,
      });
    } catch (error) {
      console.error('Error fetching category stats:', error);
      res.status(500).json({ error: 'Failed to fetch category statistics' });
    }
  }
);

export default router;

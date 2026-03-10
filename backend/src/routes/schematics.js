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

// GET /api/schematics/categories - Get all category sets with items
router.get('/categories', async (req, res) => {
  try {
    const categorySets = await prisma.categorySet.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    // Map to the same shape the frontend expects
    const result = categorySets.map(set => ({
      setName: set.name,
      setOrder: set.displayOrder,
      items: set.items.map(item => ({
        id: item.category.id,        // categoryId
        itemName: item.category.name,
        itemOrder: item.displayOrder,
      })),
    }));

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
    };

    if (itemId) {
      // itemId is now a categoryId
      where.categoryId = parseInt(itemId);
    } else if (setName) {
      // Find all categoryIds in this set
      const setItems = await prisma.categorySetItem.findMany({
        where: {
          categorySet: { name: setName },
        },
        select: { categoryId: true },
      });
      where.categoryId = { in: setItems.map(si => si.categoryId) };
    }

    // Only show schematics that belong to a category set
    if (!itemId && !setName) {
      const allSetCategoryIds = await prisma.categorySetItem.findMany({
        select: { categoryId: true },
      });
      where.categoryId = { in: allSetCategoryIds.map(si => si.categoryId) };
    }

    const [schematics, total] = await Promise.all([
      prisma.pictureSet.findMany({
        where,
        include: {
          pictures: { take: 1, orderBy: { displayOrder: 'asc' } },
          category: true,
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

    // Enrich with set info
    const categoryIds = [...new Set(schematics.map(s => s.categoryId).filter(Boolean))];
    const setItemsMap = {};
    if (categoryIds.length > 0) {
      const setItems = await prisma.categorySetItem.findMany({
        where: { categoryId: { in: categoryIds } },
        include: { categorySet: true },
      });
      for (const si of setItems) {
        setItemsMap[si.categoryId] = si.categorySet.name;
      }
    }

    // Add setName to each schematic for frontend compatibility
    const enrichedSchematics = schematics.map(s => ({
      ...s,
      schematicCategory: s.category ? {
        setName: setItemsMap[s.categoryId] || null,
        itemName: s.category.name,
      } : null,
    }));

    res.json({
      schematics: enrichedSchematics,
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

    // Total items = total CategorySetItems across all sets
    const totalItems = await prisma.categorySetItem.count();

    // Get progress for all patrouilles
    const progressData = await Promise.all(
      troupe.patrouilles.map(async (patrouille) => {
        const approvedCount = await prisma.categoryProgress.count({
          where: {
            patrouilleId: patrouille.id,
            status: 'APPROVED',
          },
        });

        const submittedCount = await prisma.categoryProgress.count({
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
          completionPercentage: totalItems > 0 ? Math.round((approvedCount / totalItems) * 100) : 0,
          isWinner: totalItems > 0 && approvedCount === totalItems,
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

      const totalItems = await prisma.categorySetItem.count();

      const progressData = await Promise.all(
        patrouilles.map(async (patrouille) => {
          const approvedCount = await prisma.categoryProgress.count({
            where: {
              patrouilleId: patrouille.id,
              status: 'APPROVED',
            },
          });

          const submittedCount = await prisma.categoryProgress.count({
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
            completionPercentage: totalItems > 0 ? Math.round((approvedCount / totalItems) * 100) : 0,
            isWinner: totalItems > 0 && approvedCount === totalItems,
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

    // Get all category sets with items
    const categorySets = await prisma.categorySet.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Get progress records for this patrouille
    const progressRecords = await prisma.categoryProgress.findMany({
      where: { patrouilleId: parseInt(patrouilleId) },
      include: {
        pictureSet: {
          include: {
            pictures: { take: 1, orderBy: { displayOrder: 'asc' } },
          },
        },
      },
    });

    // Create a map for quick lookup: categoryId -> progress
    const progressMap = new Map(progressRecords.map(p => [p.categoryId, p]));

    // Build sets with progress info
    const setsArray = categorySets.map(set => {
      let completedItems = 0;
      let totalItems = 0;

      const items = set.items.map(item => {
        const progress = progressMap.get(item.category.id);
        totalItems++;
        if (progress?.status === 'APPROVED') {
          completedItems++;
        }

        return {
          id: item.category.id,        // categoryId
          itemName: item.category.name,
          itemOrder: item.displayOrder,
          status: progress?.status || 'PENDING',
          pictureSet: progress?.pictureSet || null,
          completedAt: progress?.completedAt || null,
        };
      });

      return {
        setName: set.name,
        setOrder: set.displayOrder,
        items,
        completedItems,
        totalItems,
        isComplete: completedItems === totalItems,
      };
    });

    const completedSets = setsArray.filter(s => s.isComplete).length;
    const totalSets = setsArray.length;
    const totalCompletedItems = setsArray.reduce((sum, s) => sum + s.completedItems, 0);
    const totalAllItems = setsArray.reduce((sum, s) => sum + s.totalItems, 0);

    res.json({
      patrouille,
      sets: setsArray,
      completedSets,
      totalSets,
      isWinner: completedSets === totalSets && totalSets > 0,
      completionPercentage: totalAllItems > 0
        ? Math.round((totalCompletedItems / totalAllItems) * 100)
        : 0,
    });
  } catch (error) {
    console.error('Error fetching patrouille progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// ==========================================
// CHEF TROUPE ENDPOINTS
// ==========================================

// GET /api/schematics/unclassified - Get unclassified schematics for CT's troupe
router.get(
  '/unclassified',
  authenticate,
  authorize('CHEF_TROUPE'),
  async (req, res) => {
    try {
      const user = req.user;

      const schematics = await prisma.pictureSet.findMany({
        where: {
          type: 'SCHEMATIC',
          troupeId: user.troupeId,
          categoryId: null,
        },
        include: {
          pictures: { take: 2, orderBy: { displayOrder: 'asc' } },
          patrouille: true,
        },
        orderBy: { uploadedAt: 'desc' },
      });

      res.json({ schematics });
    } catch (error) {
      console.error('Error fetching unclassified schematics:', error);
      res.status(500).json({ error: 'Failed to fetch unclassified schematics' });
    }
  }
);

// POST /api/schematics/upload - Upload a schematic
router.post(
  '/upload',
  authenticate,
  authorize('CHEF_TROUPE'),
  upload.array('pictures', 10),
  async (req, res) => {
    try {
      const { patrouilleId, categoryId, schematicCategoryId } = req.body;
      // Support both categoryId (new) and schematicCategoryId (legacy) for backward compat
      const effectiveCategoryId = categoryId || schematicCategoryId;
      const user = req.user;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      if (!patrouilleId) {
        return res.status(400).json({ error: 'Patrouille is required' });
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

      // If categoryId provided, validate it
      let category = null;
      let setItem = null;
      let categoryIdInt = null;

      if (effectiveCategoryId) {
        categoryIdInt = parseInt(effectiveCategoryId);
        category = await prisma.category.findUnique({
          where: { id: categoryIdInt },
        });

        if (!category) {
          return res.status(404).json({ error: 'Category not found' });
        }

        setItem = await prisma.categorySetItem.findFirst({
          where: { categoryId: categoryIdInt },
          include: { categorySet: true },
        });

        if (!setItem) {
          return res.status(400).json({ error: 'Category is not part of any set' });
        }

        // Check if this item is already approved for this patrouille
        const existingApproved = await prisma.categoryProgress.findFirst({
          where: {
            patrouilleId: parseInt(patrouilleId),
            categoryId: categoryIdInt,
            status: 'APPROVED',
          },
        });

        if (existingApproved) {
          return res.status(400).json({
            error: 'This item has already been approved for this patrouille',
          });
        }
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
      const categoryLabel = category ? category.name : 'Unclassified';
      const title = `${patrouille.troupe.name}_${patrouille.name}_${categoryLabel}`;

      // Create picture set
      const pictureSet = await prisma.pictureSet.create({
        data: {
          title,
          type: 'SCHEMATIC',
          status: 'PENDING',
          uploadedById: user.id,
          troupeId: user.troupeId,
          patrouilleId: parseInt(patrouilleId),
          categoryId: categoryIdInt,
          imageHash,
          pictures: {
            create: uploadedPictures,
          },
        },
        include: {
          pictures: true,
          category: true,
          patrouille: true,
        },
      });

      // Create progress record only if category was provided
      if (categoryIdInt) {
        await prisma.categoryProgress.upsert({
          where: {
            patrouilleId_categoryId: {
              patrouilleId: parseInt(patrouilleId),
              categoryId: categoryIdInt,
            },
          },
          update: {
            status: 'SUBMITTED',
            pictureSetId: pictureSet.id,
          },
          create: {
            patrouilleId: parseInt(patrouilleId),
            categoryId: categoryIdInt,
            status: 'SUBMITTED',
            pictureSetId: pictureSet.id,
          },
        });
      }

      // Add schematicCategory field for frontend compatibility
      const responseSet = {
        ...pictureSet,
        schematicCategory: category && setItem ? {
          setName: setItem.categorySet.name,
          itemName: category.name,
        } : null,
      };

      res.status(201).json({
        message: 'Schematic uploaded successfully',
        pictureSet: responseSet,
      });
    } catch (error) {
      console.error('Error uploading schematic:', error);
      res.status(500).json({ error: 'Failed to upload schematic' });
    }
  }
);

// PUT /api/schematics/:id/classify - Classify an uploaded schematic (CT only)
router.put(
  '/:id/classify',
  authenticate,
  authorize('CHEF_TROUPE'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { categoryId } = req.body;
      const user = req.user;

      if (!categoryId) {
        return res.status(400).json({ error: 'categoryId is required' });
      }

      const categoryIdInt = parseInt(categoryId);

      // Find the picture set
      const pictureSet = await prisma.pictureSet.findUnique({
        where: { id: parseInt(id) },
        include: {
          patrouille: { include: { troupe: true } },
          pictures: true,
        },
      });

      if (!pictureSet) {
        return res.status(404).json({ error: 'Schematic not found' });
      }

      if (pictureSet.type !== 'SCHEMATIC') {
        return res.status(400).json({ error: 'This is not a schematic' });
      }

      // Authorization: must belong to user's troupe
      if (pictureSet.troupeId !== user.troupeId) {
        return res.status(403).json({ error: 'Not authorized to classify this schematic' });
      }

      // Validate category exists
      const category = await prisma.category.findUnique({
        where: { id: categoryIdInt },
      });

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      // Validate category belongs to a set
      const setItem = await prisma.categorySetItem.findFirst({
        where: { categoryId: categoryIdInt },
        include: { categorySet: true },
      });

      if (!setItem) {
        return res.status(400).json({ error: 'Category is not part of any set' });
      }

      // Check if this category is already approved for this patrouille
      const existingApproved = await prisma.categoryProgress.findFirst({
        where: {
          patrouilleId: pictureSet.patrouilleId,
          categoryId: categoryIdInt,
          status: 'APPROVED',
        },
      });

      if (existingApproved) {
        return res.status(400).json({
          error: 'This category has already been approved for this patrouille',
        });
      }

      // Update the picture set with the category
      const categoryLabel = category.name;
      const title = `${pictureSet.patrouille.troupe.name}_${pictureSet.patrouille.name}_${categoryLabel}`;

      const updatedPictureSet = await prisma.pictureSet.update({
        where: { id: parseInt(id) },
        data: {
          categoryId: categoryIdInt,
          title,
          status: 'PENDING',
        },
        include: {
          pictures: true,
          category: true,
          patrouille: true,
        },
      });

      // Create/update progress record
      await prisma.categoryProgress.upsert({
        where: {
          patrouilleId_categoryId: {
            patrouilleId: pictureSet.patrouilleId,
            categoryId: categoryIdInt,
          },
        },
        update: {
          status: 'SUBMITTED',
          pictureSetId: pictureSet.id,
        },
        create: {
          patrouilleId: pictureSet.patrouilleId,
          categoryId: categoryIdInt,
          status: 'SUBMITTED',
          pictureSetId: pictureSet.id,
        },
      });

      const responseSet = {
        ...updatedPictureSet,
        schematicCategory: {
          setName: setItem.categorySet.name,
          itemName: category.name,
        },
      };

      res.json({
        message: 'Schematic classified successfully',
        pictureSet: responseSet,
      });
    } catch (error) {
      console.error('Error classifying schematic:', error);
      res.status(500).json({ error: 'Failed to classify schematic' });
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
      const { setName, troupeId, groupId, districtId, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const where = {
        type: 'SCHEMATIC',
        status: 'PENDING',
      };

      if (setName) {
        const setItems = await prisma.categorySetItem.findMany({
          where: { categorySet: { name: setName } },
          select: { categoryId: true },
        });
        where.categoryId = { in: setItems.map(si => si.categoryId) };
      }

      if (troupeId) {
        where.troupeId = parseInt(troupeId);
      }

      if (groupId) {
        where.troupe = { ...where.troupe, groupId: parseInt(groupId) };
      }

      if (districtId) {
        where.troupe = {
          ...where.troupe,
          group: { districtId: parseInt(districtId) },
        };
      }

      // Only show schematics that belong to a category set
      if (!setName) {
        const allSetCategoryIds = await prisma.categorySetItem.findMany({
          select: { categoryId: true },
        });
        if (!where.categoryId) {
          where.categoryId = { in: allSetCategoryIds.map(si => si.categoryId) };
        }
      }

      const [schematics, total] = await Promise.all([
        prisma.pictureSet.findMany({
          where,
          include: {
            pictures: true,
            category: true,
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

      // Enrich with set info
      const categoryIds = [...new Set(schematics.map(s => s.categoryId).filter(Boolean))];
      const setItemsMap = {};
      if (categoryIds.length > 0) {
        const setItems = await prisma.categorySetItem.findMany({
          where: { categoryId: { in: categoryIds } },
          include: { categorySet: true },
        });
        for (const si of setItems) {
          setItemsMap[si.categoryId] = si.categorySet.name;
        }
      }

      const enrichedSchematics = schematics.map(s => ({
        ...s,
        schematicCategory: s.category ? {
          setName: setItemsMap[s.categoryId] || null,
          itemName: s.category.name,
        } : null,
      }));

      res.json({
        schematics: enrichedSchematics,
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
          category: true,
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
          category: true,
          patrouille: true,
        },
      });

      // Update progress record
      if (pictureSet.patrouilleId && pictureSet.categoryId) {
        await prisma.categoryProgress.upsert({
          where: {
            patrouilleId_categoryId: {
              patrouilleId: pictureSet.patrouilleId,
              categoryId: pictureSet.categoryId,
            },
          },
          update: {
            status: 'APPROVED',
            completedAt: new Date(),
          },
          create: {
            patrouilleId: pictureSet.patrouilleId,
            categoryId: pictureSet.categoryId,
            status: 'APPROVED',
            pictureSetId: pictureSet.id,
            completedAt: new Date(),
          },
        });
      }

      // Check completion
      const totalItems = await prisma.categorySetItem.count();
      const approvedCount = await prisma.categoryProgress.count({
        where: {
          patrouilleId: pictureSet.patrouilleId,
          status: 'APPROVED',
        },
      });

      // Check set completion
      let setComplete = false;
      let setName = null;
      if (pictureSet.categoryId) {
        const setItem = await prisma.categorySetItem.findFirst({
          where: { categoryId: pictureSet.categoryId },
          include: {
            categorySet: {
              include: {
                items: true,
              },
            },
          },
        });

        if (setItem) {
          setName = setItem.categorySet.name;
          const setCategoryIds = setItem.categorySet.items.map(i => i.categoryId);
          const setApprovedCount = await prisma.categoryProgress.count({
            where: {
              patrouilleId: pictureSet.patrouilleId,
              categoryId: { in: setCategoryIds },
              status: 'APPROVED',
            },
          });
          setComplete = setApprovedCount === setCategoryIds.length;
        }
      }

      const allComplete = approvedCount === totalItems && totalItems > 0;

      // Add schematicCategory for frontend compat
      const responseSet = {
        ...updatedPictureSet,
        schematicCategory: updatedPictureSet.category ? {
          setName,
          itemName: updatedPictureSet.category.name,
        } : null,
      };

      res.json({
        message: 'Schematic approved successfully',
        pictureSet: responseSet,
        progress: {
          setComplete,
          setName,
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
          category: true,
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
          category: true,
          patrouille: true,
        },
      });

      // Update progress record
      if (pictureSet.patrouilleId && pictureSet.categoryId) {
        await prisma.categoryProgress.upsert({
          where: {
            patrouilleId_categoryId: {
              patrouilleId: pictureSet.patrouilleId,
              categoryId: pictureSet.categoryId,
            },
          },
          update: {
            status: 'REJECTED',
            pictureSetId: null, // Clear the link so they can re-upload
          },
          create: {
            patrouilleId: pictureSet.patrouilleId,
            categoryId: pictureSet.categoryId,
            status: 'REJECTED',
          },
        });
      }

      // Add schematicCategory for frontend compat
      const setItem = pictureSet.categoryId ? await prisma.categorySetItem.findFirst({
        where: { categoryId: pictureSet.categoryId },
        include: { categorySet: true },
      }) : null;

      const responseSet = {
        ...updatedPictureSet,
        schematicCategory: updatedPictureSet.category ? {
          setName: setItem?.categorySet?.name || null,
          itemName: updatedPictureSet.category.name,
        } : null,
      };

      res.json({
        message: 'Schematic rejected',
        pictureSet: responseSet,
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
    if (pictureSet.patrouilleId && pictureSet.categoryId) {
      await prisma.categoryProgress.deleteMany({
        where: {
          patrouilleId: pictureSet.patrouilleId,
          categoryId: pictureSet.categoryId,
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

    let where = { type: 'SCHEMATIC' };

    // Filter by user's troupe for Chef Troupe
    if (user.role === 'CHEF_TROUPE') {
      where.troupeId = user.troupeId;
    }

    // Only count schematics whose category is in a set
    const allSetCategoryIds = await prisma.categorySetItem.findMany({
      select: { categoryId: true },
    });
    where.categoryId = { in: allSetCategoryIds.map(si => si.categoryId) };

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
      // Get all category sets with items
      const categorySets = await prisma.categorySet.findMany({
        orderBy: { displayOrder: 'asc' },
        include: {
          items: {
            orderBy: { displayOrder: 'asc' },
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });

      // Get counts for each category in sets
      const categoryStats = [];
      for (const set of categorySets) {
        for (const item of set.items) {
          const catId = item.category.id;
          const [total, approved, pending, rejected] = await Promise.all([
            prisma.pictureSet.count({
              where: { type: 'SCHEMATIC', categoryId: catId },
            }),
            prisma.pictureSet.count({
              where: { type: 'SCHEMATIC', categoryId: catId, status: 'APPROVED' },
            }),
            prisma.pictureSet.count({
              where: { type: 'SCHEMATIC', categoryId: catId, status: 'PENDING' },
            }),
            prisma.pictureSet.count({
              where: { type: 'SCHEMATIC', categoryId: catId, status: 'REJECTED' },
            }),
          ]);

          categoryStats.push({
            id: catId,
            setName: set.name,
            itemName: item.category.name,
            setOrder: set.displayOrder,
            itemOrder: item.displayOrder,
            total,
            approved,
            pending,
            rejected,
          });
        }
      }

      // Group by setName
      const bySet = {};
      for (const cat of categoryStats) {
        if (!bySet[cat.setName]) {
          bySet[cat.setName] = {
            setName: cat.setName,
            setOrder: cat.setOrder,
            items: [],
            totalUploads: 0,
            totalApproved: 0,
            totalPending: 0,
          };
        }
        bySet[cat.setName].items.push(cat);
        bySet[cat.setName].totalUploads += cat.total;
        bySet[cat.setName].totalApproved += cat.approved;
        bySet[cat.setName].totalPending += cat.pending;
      }

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

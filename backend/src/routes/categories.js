import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/categories - Get all categories with optional filtering
router.get('/', async (req, res) => {
  try {
    const { type, parentId, districtId, groupId, dateFrom, dateTo } = req.query;

    const categoryWhere = {};
    // For SCHEMATIC type, also include categories with isSchematicEnabled=true
    if (type === 'SCHEMATIC') {
      categoryWhere.OR = [
        { type: 'SCHEMATIC' },
        { isSchematicEnabled: true }
      ];
    } else if (type) {
      categoryWhere.type = type;
    }
    if (parentId) categoryWhere.parentId = parentId === 'null' ? null : parseInt(parentId);

    // Build picture set filter for counting
    const pictureSetWhere = {
      status: 'APPROVED', // Only count approved picture sets
    };

    // Apply filters to picture sets
    if (districtId || groupId || dateFrom || dateTo) {
      // Filter by troupe's group or district
      if (groupId) {
        pictureSetWhere.troupe = {
          groupId: parseInt(groupId),
        };
      } else if (districtId) {
        pictureSetWhere.troupe = {
          group: {
            districtId: parseInt(districtId),
          },
        };
      }

      // Filter by upload date range
      if (dateFrom || dateTo) {
        pictureSetWhere.uploadedAt = {};
        if (dateFrom) pictureSetWhere.uploadedAt.gte = new Date(dateFrom);
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999); // Include the entire end date
          pictureSetWhere.uploadedAt.lte = endDate;
        }
      }
    }

    // Fetch categories
    const categories = await prisma.category.findMany({
      where: categoryWhere,
      include: {
        subcategories: true,
        mainPicture: true,
      },
      orderBy: { displayOrder: 'asc' },
    });

    // For each category, count pictures and get thumbnail previews
    // Filter by individual Picture.categoryId (not PictureSet.categoryId)
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        try {
          // Build the where clause for pictures in this category
          const pictureFilter = {
            categoryId: category.id, // Filter by Picture.categoryId
            pictureSet: {
              status: 'APPROVED',
            },
          };

          // Filter by type to ensure proper separation of photos and schematics
          // Type is now per-picture, not per-set
          if (type) {
            pictureFilter.type = type;
          }

          // Apply additional filters if provided
          if (groupId) {
            pictureFilter.pictureSet.troupe = {
              groupId: parseInt(groupId),
            };
          } else if (districtId) {
            pictureFilter.pictureSet.troupe = {
              group: {
                districtId: parseInt(districtId),
              },
            };
          }

          if (dateFrom || dateTo) {
            pictureFilter.pictureSet.uploadedAt = {};
            if (dateFrom) pictureFilter.pictureSet.uploadedAt.gte = new Date(dateFrom);
            if (dateTo) {
              const endDate = new Date(dateTo);
              endDate.setHours(23, 59, 59, 999);
              pictureFilter.pictureSet.uploadedAt.lte = endDate;
            }
          }

          // Count pictures with this category
          const count = await prisma.picture.count({
            where: pictureFilter,
          });

          // Get random thumbnail pictures for preview
          // Prioritize photos over schematics when no type filter is set
          let thumbnailPictures = [];
          if (count > 0) {
            // If no type filter, try to get photos first
            if (!type) {
              const photoFilter = { ...pictureFilter, type: 'INSTALLATION_PHOTO' };
              const photoPictures = await prisma.picture.findMany({
                where: photoFilter,
                select: { id: true, filePath: true },
              });

              if (photoPictures.length > 0) {
                // Use photos for thumbnails
                const shuffled = photoPictures.sort(() => Math.random() - 0.5);
                thumbnailPictures = shuffled.slice(0, 4);
              } else {
                // No photos, fall back to schematics
                const allPictures = await prisma.picture.findMany({
                  where: pictureFilter,
                  select: { id: true, filePath: true },
                });
                const shuffled = allPictures.sort(() => Math.random() - 0.5);
                thumbnailPictures = shuffled.slice(0, 4);
              }
            } else {
              // Type filter is set, use all matching pictures
              const allPictures = await prisma.picture.findMany({
                where: pictureFilter,
                select: { id: true, filePath: true },
              });
              const shuffled = allPictures.sort(() => Math.random() - 0.5);
              thumbnailPictures = shuffled.slice(0, 4);
            }
          }

          return {
            ...category,
            _count: {
              pictures: count,
            },
            thumbnailPictures,
          };
        } catch (err) {
          console.error(`Error processing category ${category.id}:`, err);
          return {
            ...category,
            _count: {
              pictures: 0,
            },
            thumbnailPictures: [],
          };
        }
      })
    );

    res.json(categoriesWithCounts);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/monthly/all/:month/:year - Get all categories with monthly status (admin only)
// This must come BEFORE the /monthly/:month/:year route to avoid route conflict
router.get('/monthly/all/:month/:year', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    // Get all categories
    const categories = await prisma.category.findMany({
      where: {
        parentId: null, // Only root categories
      },
      include: {
        subcategories: true,
        monthlyCategories: {
          where: {
            month,
            year,
          },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    // Transform to include isEnabledThisMonth flag
    const categoriesWithStatus = categories.map(category => ({
      ...category,
      isEnabledThisMonth: category.monthlyCategories.length > 0 && category.monthlyCategories[0].isActive,
    }));

    res.json(categoriesWithStatus);
  } catch (error) {
    console.error('Get categories with monthly status error:', error);
    res.status(500).json({ error: 'Failed to fetch categories with monthly status' });
  }
});

// GET /api/categories/monthly/:month/:year - Get available categories for month
router.get('/monthly/:month/:year', async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    const monthlyCategories = await prisma.monthlyCategory.findMany({
      where: {
        month,
        year,
        isActive: true,
      },
      include: {
        category: {
          include: {
            subcategories: true,
          },
        },
      },
    });

    res.json(monthlyCategories.map(mc => mc.category));
  } catch (error) {
    console.error('Get monthly categories error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly categories' });
  }
});

// POST /api/categories - Create category (admin only)
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, description, type, parentId, displayOrder } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
        type,
        parentId: parentId ? parseInt(parentId) : null,
        displayOrder: displayOrder || 0,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Update category (admin only)
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, type, parentId, displayOrder } = req.body;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (type) updateData.type = type;
    if (parentId !== undefined) {
      updateData.parentId = parentId ? parseInt(parentId) : null;
    }
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;

    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        subcategories: true,
        parent: true,
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Delete category (admin only)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: {
        subcategories: true,
        _count: {
          select: { pictures: true },
        },
      },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has subcategories
    if (existingCategory.subcategories.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete category with subcategories. Delete subcategories first.'
      });
    }

    // Check if category has pictures
    if (existingCategory._count.pictures > 0) {
      return res.status(400).json({
        error: `Cannot delete category with ${existingCategory._count.pictures} picture(s). Remove or reassign pictures first.`
      });
    }

    await prisma.category.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// GET /api/categories/:id/stats - Get category statistics (admin only)
router.get('/:id/stats', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: parseInt(id) },
      include: {
        subcategories: true,
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Get picture counts by status (counting individual pictures, not sets)
    const [total, pending, classified, approved, rejected] = await Promise.all([
      prisma.picture.count({
        where: { categoryId: parseInt(id) },
      }),
      prisma.picture.count({
        where: { categoryId: parseInt(id), pictureSet: { status: 'PENDING' } },
      }),
      prisma.picture.count({
        where: { categoryId: parseInt(id), pictureSet: { status: 'CLASSIFIED' } },
      }),
      prisma.picture.count({
        where: { categoryId: parseInt(id), pictureSet: { status: 'APPROVED' } },
      }),
      prisma.picture.count({
        where: { categoryId: parseInt(id), pictureSet: { status: 'REJECTED' } },
      }),
    ]);

    // Get recent uploads (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentUploads = await prisma.picture.count({
      where: {
        categoryId: parseInt(id),
        uploadedAt: { gte: weekAgo },
      },
    });

    res.json({
      category,
      stats: {
        total,
        pending,
        classified,
        approved,
        rejected,
        recentUploads,
      },
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({ error: 'Failed to fetch category statistics' });
  }
});

// PATCH /api/categories/:id/settings - Update category visibility settings (admin only)
router.patch('/:id/settings', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isUploadDisabled, isHiddenFromBrowse } = req.body;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Prepare update data
    const updateData = {};
    if (typeof isUploadDisabled === 'boolean') {
      updateData.isUploadDisabled = isUploadDisabled;
    }
    if (typeof isHiddenFromBrowse === 'boolean') {
      updateData.isHiddenFromBrowse = isHiddenFromBrowse;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        subcategories: true,
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Update category settings error:', error);
    res.status(500).json({ error: 'Failed to update category settings' });
  }
});

// PATCH /api/categories/:id/schematic - Toggle schematic enabled status (admin only)
router.patch('/:id/schematic', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isSchematicEnabled } = req.body;

    if (typeof isSchematicEnabled !== 'boolean') {
      return res.status(400).json({ error: 'isSchematicEnabled must be a boolean' });
    }

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Update schematic enabled status
    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: { isSchematicEnabled },
      include: {
        subcategories: true,
        _count: {
          select: { pictures: true },
        },
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Toggle schematic error:', error);
    res.status(500).json({ error: 'Failed to toggle schematic status' });
  }
});

// POST /api/categories/monthly - Enable category for a month (admin only)
router.post('/monthly', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { categoryId, month, year } = req.body;

    if (!categoryId || !month || !year) {
      return res.status(400).json({ error: 'Category ID, month, and year are required' });
    }

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Create or update monthly category
    const monthlyCategory = await prisma.monthlyCategory.upsert({
      where: {
        categoryId_month_year: {
          categoryId: parseInt(categoryId),
          month: parseInt(month),
          year: parseInt(year),
        },
      },
      update: {
        isActive: true,
      },
      create: {
        categoryId: parseInt(categoryId),
        month: parseInt(month),
        year: parseInt(year),
        isActive: true,
      },
      include: {
        category: true,
      },
    });

    res.status(201).json(monthlyCategory);
  } catch (error) {
    console.error('Enable monthly category error:', error);
    res.status(500).json({ error: 'Failed to enable monthly category' });
  }
});

// DELETE /api/categories/monthly - Disable category for a month (admin only)
router.delete('/monthly', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { categoryId, month, year } = req.body;

    if (!categoryId || !month || !year) {
      return res.status(400).json({ error: 'Category ID, month, and year are required' });
    }

    // Set isActive to false instead of deleting
    const monthlyCategory = await prisma.monthlyCategory.updateMany({
      where: {
        categoryId: parseInt(categoryId),
        month: parseInt(month),
        year: parseInt(year),
      },
      data: {
        isActive: false,
      },
    });

    res.json({ message: 'Monthly category disabled successfully' });
  } catch (error) {
    console.error('Disable monthly category error:', error);
    res.status(500).json({ error: 'Failed to disable monthly category' });
  }
});

// PATCH /api/categories/:id/main-picture - Set main picture for category (admin only)
router.patch('/:id/main-picture', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { pictureId } = req.body;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // If pictureId provided, verify it exists
    if (pictureId) {
      const picture = await prisma.picture.findUnique({
        where: { id: parseInt(pictureId) },
      });

      if (!picture) {
        return res.status(404).json({ error: 'Picture not found' });
      }
    }

    // Update category main picture
    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: {
        mainPictureId: pictureId ? parseInt(pictureId) : null,
      },
      include: {
        mainPicture: true,
        subcategories: true,
        _count: {
          select: { pictures: true },
        },
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Set main picture error:', error);
    res.status(500).json({ error: 'Failed to set main picture' });
  }
});

// GET /api/categories/:id/pictures - Get all approved pictures in a category with optional filtering
router.get('/:id/pictures', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      districtId, groupId, dateFrom, dateTo, woodCountMin, woodCountMax, type,
      dateDoneMonth, dateDoneYear, sortBy, sortOrder, grouped
    } = req.query;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: parseInt(id) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Build where clause for picture filtering
    // Filter by Picture.categoryId (individual picture category, not set)
    const pictureWhere = {
      categoryId: parseInt(id), // Filter by Picture.categoryId
      pictureSet: {
        status: 'APPROVED',
      },
    };

    // Filter by picture type (INSTALLATION_PHOTO or SCHEMATIC)
    // Type is now per-picture, not per-set
    if (type) {
      pictureWhere.type = type;
    }

    // Apply filters
    if (groupId) {
      pictureWhere.pictureSet.troupe = {
        groupId: parseInt(groupId),
      };
    } else if (districtId) {
      pictureWhere.pictureSet.troupe = {
        group: {
          districtId: parseInt(districtId),
        },
      };
    }

    // Filter by upload date range
    if (dateFrom || dateTo) {
      pictureWhere.pictureSet.uploadedAt = {};
      if (dateFrom) pictureWhere.pictureSet.uploadedAt.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        pictureWhere.pictureSet.uploadedAt.lte = endDate;
      }
    }

    // Filter by wood count range
    if (woodCountMin || woodCountMax) {
      pictureWhere.pictureSet.woodCount = {};
      if (woodCountMin) pictureWhere.pictureSet.woodCount.gte = parseInt(woodCountMin);
      if (woodCountMax) pictureWhere.pictureSet.woodCount.lte = parseInt(woodCountMax);
    }

    // Filter by takenAt (date done) month and year
    if (dateDoneMonth || dateDoneYear) {
      const year = dateDoneYear ? parseInt(dateDoneYear) : new Date().getFullYear();
      const month = dateDoneMonth ? parseInt(dateDoneMonth) : null;

      if (month) {
        // Filter by specific month and year
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
        pictureWhere.takenAt = {
          gte: startDate,
          lte: endDate,
        };
      } else if (dateDoneYear) {
        // Filter by year only
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
        pictureWhere.takenAt = {
          gte: startDate,
          lte: endDate,
        };
      }
    }

    // Build order by clause
    let orderByClause;
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'woodCount':
        orderByClause = { pictureSet: { woodCount: order } };
        break;
      case 'dateDone':
        orderByClause = { takenAt: order };
        break;
      case 'uploadDate':
      default:
        orderByClause = { pictureSet: { uploadedAt: order } };
        break;
    }

    // Get pictures that belong to this category (via Picture.categoryId)
    const pictures = await prisma.picture.findMany({
      where: pictureWhere,
      include: {
        category: true,
        designGroup: {
          include: {
            primaryPicture: {
              select: {
                id: true,
                filePath: true,
              },
            },
            _count: {
              select: { pictures: true },
            },
          },
        },
        pictureSet: {
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
            patrouille: true,
            uploadedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: orderByClause,
    });

    // Transform to expected format
    const transformedPictures = pictures.map(pic => ({
      ...pic,
      troupe: pic.pictureSet.troupe,
      patrouille: pic.pictureSet.patrouille,
      pictureSet: {
        id: pic.pictureSet.id,
        title: pic.pictureSet.title,
        description: pic.pictureSet.description,
        location: pic.pictureSet.location,
        uploadedAt: pic.pictureSet.uploadedAt,
        woodCount: pic.pictureSet.woodCount,
      },
    }));

    // If grouped=true, organize pictures by design groups
    if (grouped === 'true') {
      const designGroups = [];
      const ungroupedPictures = [];
      const seenGroupIds = new Set();

      for (const pic of transformedPictures) {
        if (pic.designGroup && pic.designGroupId) {
          // Picture belongs to a design group
          if (!seenGroupIds.has(pic.designGroupId)) {
            seenGroupIds.add(pic.designGroupId);
            // Get all pictures in this group (from the fetched data)
            const groupPictures = transformedPictures.filter(p => p.designGroupId === pic.designGroupId);
            designGroups.push({
              id: pic.designGroup.id,
              name: pic.designGroup.name,
              primaryPicture: pic.designGroup.primaryPicture,
              pictureCount: pic.designGroup._count?.pictures || groupPictures.length,
              pictures: groupPictures,
            });
          }
        } else {
          // Picture is not in any group
          ungroupedPictures.push(pic);
        }
      }

      return res.json({
        category,
        grouped: true,
        designGroups,
        ungroupedPictures,
        totalPictures: transformedPictures.length,
      });
    }

    res.json({ category, pictures: transformedPictures });
  } catch (error) {
    console.error('Get category pictures error:', error);
    res.status(500).json({ error: 'Failed to fetch category pictures' });
  }
});

export default router;

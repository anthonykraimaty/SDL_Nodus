import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to check if user can access pictures in specific districts
const getUserDistrictIds = async (userId) => {
  const userDistrictAccess = await prisma.userDistrictAccess.findMany({
    where: { userId },
    select: { districtId: true },
  });
  return userDistrictAccess.map(uda => uda.districtId);
};

// Helper function to check if user can modify a design group
const canModifyDesignGroup = async (userId, userRole, designGroupId) => {
  const designGroup = await prisma.designGroup.findUnique({
    where: { id: designGroupId },
    include: {
      createdBy: true,
    },
  });

  if (!designGroup) return { allowed: false, error: 'Design group not found', status: 404 };

  // Admin can modify any group
  if (userRole === 'ADMIN') return { allowed: true, designGroup };

  // Creator can modify their own groups
  if (designGroup.createdById === userId) return { allowed: true, designGroup };

  // Branche can modify groups in their districts
  if (userRole === 'BRANCHE_ECLAIREURS') {
    const districtIds = await getUserDistrictIds(userId);
    // Check if any picture in the group is from an allowed district
    const pictures = await prisma.picture.findMany({
      where: { designGroupId },
      include: {
        pictureSet: {
          include: {
            troupe: {
              include: {
                group: true,
              },
            },
          },
        },
      },
    });

    const hasAccess = pictures.some(pic =>
      districtIds.includes(pic.pictureSet?.troupe?.group?.districtId)
    );

    if (hasAccess) return { allowed: true, designGroup };
  }

  return { allowed: false, error: 'Insufficient permissions', status: 403 };
};

// Helper function to check if user can add specific pictures to a group
const canUserAccessPictures = async (userId, userRole, pictureIds) => {
  const pictures = await prisma.picture.findMany({
    where: { id: { in: pictureIds } },
    include: {
      pictureSet: {
        include: {
          troupe: {
            include: {
              group: true,
            },
          },
        },
      },
    },
  });

  if (pictures.length !== pictureIds.length) {
    return { allowed: false, error: 'Some pictures not found', status: 404 };
  }

  // Admin can access any pictures
  if (userRole === 'ADMIN') return { allowed: true, pictures };

  // Branche can access pictures from their districts
  if (userRole === 'BRANCHE_ECLAIREURS') {
    const districtIds = await getUserDistrictIds(userId);
    const allAccessible = pictures.every(pic =>
      districtIds.includes(pic.pictureSet?.troupe?.group?.districtId)
    );
    if (!allAccessible) {
      return { allowed: false, error: 'You can only group pictures from your assigned districts', status: 403 };
    }
    return { allowed: true, pictures };
  }

  return { allowed: false, error: 'Insufficient permissions', status: 403 };
};

// GET /api/design-groups - List design groups with filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { categoryId, page = 1, limit = 50 } = req.query;

    const where = {};

    // Filter by category
    if (categoryId) {
      where.categoryId = parseInt(categoryId);
    }

    // For public access, only show groups with approved pictures
    if (!req.user) {
      where.pictures = {
        some: {
          pictureSet: {
            status: 'APPROVED',
          },
        },
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [designGroups, total] = await Promise.all([
      prisma.designGroup.findMany({
        where,
        include: {
          primaryPicture: {
            select: {
              id: true,
              filePath: true,
              type: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              pictures: true,
            },
          },
          pictures: {
            take: 4,
            select: {
              id: true,
              filePath: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.designGroup.count({ where }),
    ]);

    res.json({
      designGroups,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching design groups:', error);
    res.status(500).json({ error: 'Failed to fetch design groups' });
  }
});

// GET /api/design-groups/:id - Get single design group with all pictures
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const designGroup = await prisma.designGroup.findUnique({
      where: { id: parseInt(id) },
      include: {
        primaryPicture: {
          select: {
            id: true,
            filePath: true,
            type: true,
            categoryId: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        pictures: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            pictureSet: {
              select: {
                id: true,
                title: true,
                status: true,
                troupe: {
                  select: {
                    id: true,
                    name: true,
                    group: {
                      select: {
                        id: true,
                        name: true,
                        district: {
                          select: {
                            id: true,
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!designGroup) {
      return res.status(404).json({ error: 'Design group not found' });
    }

    // For public access, filter to only approved pictures
    if (!req.user) {
      designGroup.pictures = designGroup.pictures.filter(
        pic => pic.pictureSet?.status === 'APPROVED'
      );
    }

    res.json(designGroup);
  } catch (error) {
    console.error('Error fetching design group:', error);
    res.status(500).json({ error: 'Failed to fetch design group' });
  }
});

// POST /api/design-groups - Create new design group
router.post('/', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { name, pictureIds, primaryPictureId } = req.body;

    if (!pictureIds || !Array.isArray(pictureIds) || pictureIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 pictures are required to create a design group' });
    }

    // Check user can access all pictures
    const accessCheck = await canUserAccessPictures(req.user.id, req.user.role, pictureIds);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    const { pictures } = accessCheck;

    // Check if any pictures are already in a group
    const alreadyGrouped = pictures.filter(pic => pic.designGroupId);
    if (alreadyGrouped.length > 0) {
      return res.status(400).json({
        error: `${alreadyGrouped.length} picture(s) are already in a design group. Remove them first.`,
        alreadyGroupedIds: alreadyGrouped.map(p => p.id),
      });
    }

    // Get category from first picture (or most common category)
    const categoryId = pictures[0]?.categoryId || null;

    // Determine primary picture
    let actualPrimaryId = primaryPictureId;
    if (!actualPrimaryId || !pictureIds.includes(actualPrimaryId)) {
      actualPrimaryId = pictureIds[0];
    }

    // Create design group
    const designGroup = await prisma.designGroup.create({
      data: {
        name: name || null,
        primaryPictureId: actualPrimaryId,
        categoryId,
        createdById: req.user.id,
      },
    });

    // Update pictures to belong to this group
    await prisma.picture.updateMany({
      where: { id: { in: pictureIds } },
      data: { designGroupId: designGroup.id },
    });

    // Fetch the complete group with relations
    const result = await prisma.designGroup.findUnique({
      where: { id: designGroup.id },
      include: {
        primaryPicture: true,
        category: true,
        pictures: true,
        _count: { select: { pictures: true } },
      },
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating design group:', error);
    res.status(500).json({ error: 'Failed to create design group' });
  }
});

// PUT /api/design-groups/:id - Update design group
router.put('/:id', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, primaryPictureId, categoryId } = req.body;

    // Check permissions
    const permCheck = await canModifyDesignGroup(req.user.id, req.user.role, parseInt(id));
    if (!permCheck.allowed) {
      return res.status(permCheck.status).json({ error: permCheck.error });
    }

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (categoryId !== undefined) updateData.categoryId = categoryId ? parseInt(categoryId) : null;

    if (primaryPictureId !== undefined) {
      // Verify the picture belongs to this group
      const picture = await prisma.picture.findFirst({
        where: {
          id: parseInt(primaryPictureId),
          designGroupId: parseInt(id),
        },
      });

      if (!picture) {
        return res.status(400).json({ error: 'Primary picture must belong to this design group' });
      }

      updateData.primaryPictureId = parseInt(primaryPictureId);
    }

    const designGroup = await prisma.designGroup.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        primaryPicture: true,
        category: true,
        pictures: true,
        _count: { select: { pictures: true } },
      },
    });

    res.json(designGroup);
  } catch (error) {
    console.error('Error updating design group:', error);
    res.status(500).json({ error: 'Failed to update design group' });
  }
});

// POST /api/design-groups/:id/pictures - Add pictures to group
router.post('/:id/pictures', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { pictureIds } = req.body;

    if (!pictureIds || !Array.isArray(pictureIds) || pictureIds.length === 0) {
      return res.status(400).json({ error: 'Picture IDs are required' });
    }

    // Check permissions on the group
    const permCheck = await canModifyDesignGroup(req.user.id, req.user.role, parseInt(id));
    if (!permCheck.allowed) {
      return res.status(permCheck.status).json({ error: permCheck.error });
    }

    // Check user can access the pictures
    const accessCheck = await canUserAccessPictures(req.user.id, req.user.role, pictureIds);
    if (!accessCheck.allowed) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    const { pictures } = accessCheck;

    // Check if any pictures are already in a different group
    const alreadyGrouped = pictures.filter(pic => pic.designGroupId && pic.designGroupId !== parseInt(id));
    if (alreadyGrouped.length > 0) {
      return res.status(400).json({
        error: `${alreadyGrouped.length} picture(s) are already in another design group`,
        alreadyGroupedIds: alreadyGrouped.map(p => p.id),
      });
    }

    // Add pictures to group
    await prisma.picture.updateMany({
      where: { id: { in: pictureIds } },
      data: { designGroupId: parseInt(id) },
    });

    // Return updated group
    const designGroup = await prisma.designGroup.findUnique({
      where: { id: parseInt(id) },
      include: {
        primaryPicture: true,
        category: true,
        pictures: true,
        _count: { select: { pictures: true } },
      },
    });

    res.json(designGroup);
  } catch (error) {
    console.error('Error adding pictures to design group:', error);
    res.status(500).json({ error: 'Failed to add pictures to design group' });
  }
});

// DELETE /api/design-groups/:id/pictures/:pictureId - Remove picture from group
router.delete('/:id/pictures/:pictureId', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { id, pictureId } = req.params;

    // Check permissions
    const permCheck = await canModifyDesignGroup(req.user.id, req.user.role, parseInt(id));
    if (!permCheck.allowed) {
      return res.status(permCheck.status).json({ error: permCheck.error });
    }

    // Check picture belongs to this group
    const picture = await prisma.picture.findFirst({
      where: {
        id: parseInt(pictureId),
        designGroupId: parseInt(id),
      },
    });

    if (!picture) {
      return res.status(404).json({ error: 'Picture not found in this design group' });
    }

    // Remove picture from group
    await prisma.picture.update({
      where: { id: parseInt(pictureId) },
      data: { designGroupId: null },
    });

    // Check remaining pictures in group
    const remainingCount = await prisma.picture.count({
      where: { designGroupId: parseInt(id) },
    });

    // If less than 2 pictures remain, delete the group
    if (remainingCount < 2) {
      // Remove group membership from remaining pictures
      await prisma.picture.updateMany({
        where: { designGroupId: parseInt(id) },
        data: { designGroupId: null },
      });

      // Delete the group
      await prisma.designGroup.delete({
        where: { id: parseInt(id) },
      });

      return res.json({
        message: 'Picture removed and design group deleted (less than 2 pictures remaining)',
        groupDeleted: true,
      });
    }

    // If removed picture was primary, select a new primary
    const group = await prisma.designGroup.findUnique({
      where: { id: parseInt(id) },
    });

    if (group.primaryPictureId === parseInt(pictureId)) {
      const newPrimary = await prisma.picture.findFirst({
        where: { designGroupId: parseInt(id) },
        orderBy: { displayOrder: 'asc' },
      });

      await prisma.designGroup.update({
        where: { id: parseInt(id) },
        data: { primaryPictureId: newPrimary?.id || null },
      });
    }

    // Return updated group
    const designGroup = await prisma.designGroup.findUnique({
      where: { id: parseInt(id) },
      include: {
        primaryPicture: true,
        category: true,
        pictures: true,
        _count: { select: { pictures: true } },
      },
    });

    res.json({
      message: 'Picture removed from design group',
      groupDeleted: false,
      designGroup,
    });
  } catch (error) {
    console.error('Error removing picture from design group:', error);
    res.status(500).json({ error: 'Failed to remove picture from design group' });
  }
});

// DELETE /api/design-groups/:id - Delete design group
router.delete('/:id', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    const permCheck = await canModifyDesignGroup(req.user.id, req.user.role, parseInt(id));
    if (!permCheck.allowed) {
      return res.status(permCheck.status).json({ error: permCheck.error });
    }

    // Only admin or creator can delete groups
    if (req.user.role !== 'ADMIN' && permCheck.designGroup.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Only the creator or admin can delete design groups' });
    }

    // Remove group membership from all pictures
    await prisma.picture.updateMany({
      where: { designGroupId: parseInt(id) },
      data: { designGroupId: null },
    });

    // Delete the group
    await prisma.designGroup.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Design group deleted successfully' });
  } catch (error) {
    console.error('Error deleting design group:', error);
    res.status(500).json({ error: 'Failed to delete design group' });
  }
});

// GET /api/design-groups/by-category/:categoryId - Get groups for a specific category
router.get('/by-category/:categoryId', optionalAuth, async (req, res) => {
  try {
    const { categoryId } = req.params;

    const where = {
      categoryId: parseInt(categoryId),
    };

    // For public access, only show groups with approved pictures
    if (!req.user) {
      where.pictures = {
        some: {
          pictureSet: {
            status: 'APPROVED',
          },
        },
      };
    }

    const designGroups = await prisma.designGroup.findMany({
      where,
      include: {
        primaryPicture: {
          select: {
            id: true,
            filePath: true,
            type: true,
          },
        },
        _count: {
          select: {
            pictures: true,
          },
        },
        pictures: {
          take: 4,
          select: {
            id: true,
            filePath: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(designGroups);
  } catch (error) {
    console.error('Error fetching design groups by category:', error);
    res.status(500).json({ error: 'Failed to fetch design groups' });
  }
});

export default router;

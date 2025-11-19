import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, canModifyPicture, optionalAuth } from '../middleware/auth.js';
import { upload, handleUploadError } from '../middleware/upload.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/pictures - Get all picture sets (public for approved, filtered for authenticated)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      status,
      type,
      categoryId,
      groupId,
      troupeId,
      patrouilleId,
      startDate,
      endDate,
      highlights,
      page = 1,
      limit = 20,
    } = req.query;

    const where = {};

    // Public users can only see approved picture sets
    if (!req.user) {
      where.status = 'APPROVED';
    } else {
      // Authenticated users filter based on role
      if (req.user.role === 'CHEF_TROUPE') {
        // Chef troupe sees their own picture sets (all statuses) or approved picture sets
        if (status) {
          where.status = status;
          where.uploadedById = req.user.id;
        } else {
          where.OR = [
            { uploadedById: req.user.id },
            { status: 'APPROVED' },
          ];
        }
      } else if (req.user.role === 'BRANCHE_ECLAIREURS') {
        // Branche sees picture sets from districts they have access to
        const userDistrictAccess = await prisma.userDistrictAccess.findMany({
          where: { userId: req.user.id },
          select: { districtId: true },
        });

        const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);

        where.troupe = {
          group: {
            districtId: { in: allowedDistrictIds },
          },
        };

        if (status) where.status = status;
      } else if (req.user.role === 'ADMIN') {
        // Admin sees all picture sets
        if (status) where.status = status;
      }
    }

    // Apply filters
    if (type) where.type = type;
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (groupId) where.troupe = { groupId: parseInt(groupId) };
    if (troupeId) where.troupeId = parseInt(troupeId);
    if (patrouilleId) where.patrouilleId = parseInt(patrouilleId);
    if (highlights === 'true') where.isHighlight = true;

    if (startDate || endDate) {
      where.uploadedAt = {};
      if (startDate) where.uploadedAt.gte = new Date(startDate);
      if (endDate) where.uploadedAt.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [pictureSets, total] = await Promise.all([
      prisma.pictureSet.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, name: true } },
          troupe: {
            include: {
              group: {
                include: { district: true },
              },
            },
          },
          patrouille: true,
          category: true,
          subCategory: true,
          tags: true,
          pictures: { orderBy: { displayOrder: 'asc' } },
        },
        orderBy: { uploadedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.pictureSet.count({ where }),
    ]);

    res.json({
      pictures: pictureSets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get picture sets error:', error);
    res.status(500).json({ error: 'Failed to fetch picture sets' });
  }
});

// GET /api/pictures/:id - Get single picture set
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        troupe: {
          include: {
            group: {
              include: { district: true },
            },
          },
        },
        patrouille: true,
        category: true,
        subCategory: true,
        tags: true,
        pictures: { orderBy: { displayOrder: 'asc' } },
        approvedBy: { select: { id: true, name: true } },
        classifiedBy: { select: { id: true, name: true } },
      },
    });

    if (!pictureSet) {
      return res.status(404).json({ error: 'Picture set not found' });
    }

    // Check access permissions
    if (pictureSet.status !== 'APPROVED' && !req.user) {
      return res.status(403).json({ error: 'Picture set not publicly available' });
    }

    if (pictureSet.status !== 'APPROVED' && req.user) {
      if (
        req.user.role === 'CHEF_TROUPE' &&
        pictureSet.uploadedById !== req.user.id
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Increment view count
    await prisma.pictureSet.update({
      where: { id: pictureSet.id },
      data: { viewCount: { increment: 1 } },
    });

    res.json(pictureSet);
  } catch (error) {
    console.error('Get picture set error:', error);
    res.status(500).json({ error: 'Failed to fetch picture set' });
  }
});

// POST /api/pictures - Upload picture set (chef troupe only)
router.post(
  '/',
  authenticate,
  authorize('CHEF_TROUPE'),
  upload.array('pictures', 100), // Allow up to 100 pictures per set for bulk upload
  handleUploadError,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const { type, patrouilleId } = req.body;

      if (!type) {
        return res.status(400).json({ error: 'Type is required' });
      }

      if (!['INSTALLATION_PHOTO', 'SCHEMATIC'].includes(type)) {
        return res.status(400).json({ error: 'Invalid picture type' });
      }

      // For schematics, patrouille is mandatory
      if (type === 'SCHEMATIC' && !patrouilleId) {
        return res.status(400).json({ error: 'Patrouille is required for schematics' });
      }

      // Verify patrouille belongs to user's troupe if provided
      if (patrouilleId) {
        const patrouille = await prisma.patrouille.findUnique({
          where: { id: parseInt(patrouilleId) },
        });

        if (!patrouille || patrouille.troupeId !== req.user.troupeId) {
          return res.status(400).json({
            error: 'Invalid patrouille or patrouille does not belong to your troupe',
          });
        }
      }

      // Get user's troupe with district and group info
      const troupe = await prisma.troupe.findUnique({
        where: { id: req.user.troupeId },
        include: {
          group: {
            include: { district: true },
          },
        },
      });

      if (!troupe) {
        return res.status(400).json({ error: 'User troupe not found' });
      }

      // Get the count of picture sets uploaded by this troupe
      const troupeSetCount = await prisma.pictureSet.count({
        where: { troupeId: req.user.troupeId },
      });

      // Generate title: District_Group_Troupe_Set##
      const title = `${troupe.group.district.name}_${troupe.group.name}_${troupe.name}_Set${String(troupeSetCount).padStart(2, '0')}`;

      // Create picture set - status is PENDING by default
      const pictureSetData = {
        title,
        type,
        status: 'PENDING', // Always start as PENDING
        uploadedById: req.user.id,
        troupeId: req.user.troupeId,
        patrouilleId: patrouilleId ? parseInt(patrouilleId) : null,
        pictures: {
          create: req.files.map((file, index) => {
            // Convert absolute path to relative path for serving
            const relativePath = file.path.replace(/\\/g, '/').split('/uploads/').pop();
            return {
              filePath: `uploads/${relativePath}`,
              displayOrder: index + 1,
            };
          }),
        },
      };

      const pictureSet = await prisma.pictureSet.create({
        data: pictureSetData,
        include: {
          uploadedBy: { select: { id: true, name: true } },
          troupe: true,
          patrouille: true,
          category: true,
          subCategory: true,
          pictures: { orderBy: { displayOrder: 'asc' } },
        },
      });

      res.status(201).json({
        message: 'Picture set uploaded successfully',
        pictureSet,
      });
    } catch (error) {
      console.error('Upload picture set error:', error);
      res.status(500).json({ error: 'Failed to upload picture set' });
    }
  }
);

// PUT /api/pictures/:id/classify - Classify picture set (owner or branche with district access)
router.put('/:id/classify', authenticate, async (req, res) => {
  try {
    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        troupe: {
          include: {
            group: {
              include: { district: true },
            },
          },
        },
      },
    });

    if (!pictureSet) {
      return res.status(404).json({ error: 'Picture set not found' });
    }

    // Check permissions based on role
    let canModify = false;

    if (req.user.role === 'ADMIN') {
      // Admin can classify everything
      canModify = true;
    } else if (req.user.role === 'CHEF_TROUPE') {
      // Chef can only classify their own uploads
      canModify = pictureSet.uploadedById === req.user.id;
    } else if (req.user.role === 'BRANCHE_ECLAIREURS') {
      // Branche can only classify pictures from districts they have access to
      const userDistrictAccess = await prisma.userDistrictAccess.findMany({
        where: { userId: req.user.id },
        select: { districtId: true },
      });

      const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
      const pictureDistrictId = pictureSet.troupe?.group?.district?.id;

      canModify = allowedDistrictIds.includes(pictureDistrictId);
    }

    if (!canModify) {
      return res.status(403).json({
        error: req.user.role === 'CHEF_TROUPE'
          ? 'You can only classify your own uploads'
          : 'You do not have access to classify pictures from this district',
      });
    }

    const { categoryId, subCategoryId, description, location, latitude, longitude, tags } = req.body;

    const updateData = {
      status: 'CLASSIFIED',
      classifiedById: req.user.id,
      classifiedAt: new Date(),
    };

    if (categoryId) updateData.categoryId = parseInt(categoryId);
    if (subCategoryId) updateData.subCategoryId = parseInt(subCategoryId);
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude);
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude);

    // Handle tags
    if (tags && Array.isArray(tags)) {
      updateData.tags = {
        set: tags.map(tagId => ({ id: parseInt(tagId) })),
      };
    }

    const updatedPictureSet = await prisma.pictureSet.update({
      where: { id: parseInt(req.params.id) },
      data: updateData,
      include: {
        category: true,
        subCategory: true,
        tags: true,
        pictures: { orderBy: { displayOrder: 'asc' } },
      },
    });

    res.json({
      message: 'Picture set classified successfully',
      pictureSet: updatedPictureSet,
    });
  } catch (error) {
    console.error('Classify picture set error:', error);
    res.status(500).json({ error: 'Failed to classify picture set' });
  }
});

// PUT /api/pictures/:id/classify-bulk - Bulk classify individual pictures in a set
router.put('/:id/classify-bulk', authenticate, async (req, res) => {
  try {
    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { pictures: true },
    });

    if (!pictureSet) {
      return res.status(404).json({ error: 'Picture set not found' });
    }

    // Check permissions
    const canModify =
      req.user.role === 'ADMIN' ||
      req.user.role === 'BRANCHE_ECLAIREURS' ||
      pictureSet.uploadedById === req.user.id;

    if (!canModify) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { classifications } = req.body;

    if (!classifications || !Array.isArray(classifications)) {
      return res.status(400).json({ error: 'Classifications array is required' });
    }

    // Update each picture with its classification
    const updatePromises = classifications.map(({ pictureId, categoryId, takenAt }) => {
      const updateData = { categoryId: parseInt(categoryId) };
      if (takenAt) updateData.takenAt = new Date(takenAt);

      return prisma.picture.update({
        where: { id: parseInt(pictureId) },
        data: updateData,
      });
    });

    await Promise.all(updatePromises);

    // Update picture set status to CLASSIFIED
    const updatedPictureSet = await prisma.pictureSet.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: 'CLASSIFIED',
        classifiedById: req.user.id,
        classifiedAt: new Date(),
      },
      include: {
        category: true,
        pictures: { orderBy: { displayOrder: 'asc' } },
      },
    });

    res.json({
      message: 'Pictures classified successfully',
      pictureSet: updatedPictureSet,
    });
  } catch (error) {
    console.error('Bulk classify error:', error);
    res.status(500).json({ error: 'Failed to classify pictures' });
  }
});

// POST /api/pictures/:id/approve - Approve picture set (branche only)
router.post('/:id/approve', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { isHighlight } = req.body;

    const pictureSet = await prisma.pictureSet.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: 'APPROVED',
        approvedById: req.user.id,
        approvedAt: new Date(),
        isHighlight: isHighlight || false,
      },
      include: {
        approvedBy: { select: { id: true, name: true } },
        pictures: { orderBy: { displayOrder: 'asc' } },
      },
    });

    res.json({
      message: 'Picture set approved successfully',
      pictureSet,
    });
  } catch (error) {
    console.error('Approve picture set error:', error);
    res.status(500).json({ error: 'Failed to approve picture set' });
  }
});

// POST /api/pictures/:id/reject - Reject picture set (branche only)
router.post('/:id/reject', authenticate, authorize('BRANCHE_ECLAIREURS', 'ADMIN'), async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const pictureSet = await prisma.pictureSet.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: 'REJECTED',
        approvedById: req.user.id,
        approvedAt: new Date(),
        rejectionReason,
      },
      include: {
        pictures: { orderBy: { displayOrder: 'asc' } },
      },
    });

    res.json({
      message: 'Picture set rejected',
      pictureSet,
    });
  } catch (error) {
    console.error('Reject picture set error:', error);
    res.status(500).json({ error: 'Failed to reject picture set' });
  }
});

// DELETE /api/pictures/:id - Delete picture set (owner or admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { pictures: true },
    });

    if (!pictureSet) {
      return res.status(404).json({ error: 'Picture set not found' });
    }

    // Only owner or admin can delete
    if (pictureSet.uploadedById !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await prisma.pictureSet.delete({
      where: { id: parseInt(req.params.id) },
    });

    // TODO: Delete files from filesystem

    res.json({ message: 'Picture set deleted successfully' });
  } catch (error) {
    console.error('Delete picture set error:', error);
    res.status(500).json({ error: 'Failed to delete picture set' });
  }
});

export default router;

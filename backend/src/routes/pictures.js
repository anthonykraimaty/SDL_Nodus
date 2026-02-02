import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, canModifyPicture, optionalAuth } from '../middleware/auth.js';
import { upload, handleUploadError, processUpload } from '../middleware/upload.js';
import { deleteFromR2, isR2Configured, uploadMultipleToR2 } from '../services/r2Storage.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        // SECURITY: Deny-by-default - if no district access entries, branche sees nothing
        if (allowedDistrictIds.length === 0) {
          // No district access assigned - return empty result
          where.id = -1; // Will match nothing
        } else {
          // Filter by assigned districts only
          where.troupe = {
            group: {
              districtId: { in: allowedDistrictIds },
            },
          };
        }

        if (status) where.status = status;
      } else if (req.user.role === 'ADMIN') {
        // Admin sees all picture sets
        if (status) where.status = status;
      }
    }

    // Apply filters
    if (type) where.type = type;
    // Note: categoryId filter is no longer at PictureSet level - categories are assigned per Picture
    // If you need to filter by category, query pictures instead and group by pictureSetId
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
          pictures: {
            orderBy: { displayOrder: 'asc' },
            include: { category: true },
          },
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
        pictures: {
          orderBy: { displayOrder: 'asc' },
          include: { category: true },
        },
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

      // Handle file paths based on storage type (R2 or local)
      let pictureData;

      if (isR2Configured()) {
        // Upload to R2
        const r2Results = await uploadMultipleToR2(req.files);
        pictureData = r2Results.map((result, index) => ({
          filePath: result.url, // Full CDN URL for R2
          displayOrder: index + 1,
        }));
      } else {
        // Local storage
        pictureData = req.files.map((file, index) => {
          const relativePath = file.path.replace(/\\/g, '/').split('/uploads/').pop();
          return {
            filePath: `uploads/${relativePath}`,
            displayOrder: index + 1,
          };
        });
      }

      // Create picture set - status is PENDING by default
      const pictureSetData = {
        title,
        type,
        status: 'PENDING', // Always start as PENDING
        uploadedById: req.user.id,
        troupeId: req.user.troupeId,
        patrouilleId: patrouilleId ? parseInt(patrouilleId) : null,
        pictures: {
          create: pictureData,
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

      // SECURITY: Deny-by-default - branche must have explicit district access
      canModify = allowedDistrictIds.length > 0 && allowedDistrictIds.includes(pictureDistrictId);
    }

    if (!canModify) {
      return res.status(403).json({
        error: req.user.role === 'CHEF_TROUPE'
          ? 'You can only classify your own uploads'
          : 'You do not have access to classify pictures from this district',
      });
    }

    const { categoryId, subCategoryId, description, location, latitude, longitude, tags, woodCount } = req.body;

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
    if (woodCount !== undefined) updateData.woodCount = woodCount ? parseInt(woodCount) : null;

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

    const { classifications, woodCount, type } = req.body;

    if (!classifications || !Array.isArray(classifications)) {
      return res.status(400).json({ error: 'Classifications array is required' });
    }

    // Validate type if provided
    if (type && !['INSTALLATION_PHOTO', 'SCHEMATIC'].includes(type)) {
      return res.status(400).json({ error: 'Invalid picture type' });
    }

    // Update each picture with its classification
    const updatePromises = classifications.map(({ pictureId, categoryId, takenAt, woodCount: picWoodCount }) => {
      const updateData = { categoryId: parseInt(categoryId) };
      if (takenAt) updateData.takenAt = new Date(takenAt);
      // Handle woodCount - convert to int or null (empty string should be null)
      if (picWoodCount !== undefined && picWoodCount !== null && picWoodCount !== '') {
        updateData.woodCount = parseInt(picWoodCount);
      } else {
        updateData.woodCount = null;
      }

      return prisma.picture.update({
        where: { id: parseInt(pictureId) },
        data: updateData,
      });
    });

    await Promise.all(updatePromises);

    // Update picture set status to CLASSIFIED and optionally woodCount and type
    const pictureSetUpdateData = {
      status: 'CLASSIFIED',
      classifiedById: req.user.id,
      classifiedAt: new Date(),
    };

    if (woodCount !== undefined) {
      pictureSetUpdateData.woodCount = woodCount ? parseInt(woodCount) : null;
    }

    // Allow changing the type during classification
    if (type) {
      pictureSetUpdateData.type = type;
    }

    // Note: Categories are now assigned per Picture, not per PictureSet
    // The Browse page filters by Picture.categoryId, not PictureSet.categoryId

    const updatedPictureSet = await prisma.pictureSet.update({
      where: { id: parseInt(req.params.id) },
      data: pictureSetUpdateData,
      include: {
        category: true,
        pictures: {
          orderBy: { displayOrder: 'asc' },
          include: { category: true },
        },
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
    const { isHighlight, excludedPictureIds } = req.body;

    // If there are excluded pictures, delete them first
    if (excludedPictureIds && excludedPictureIds.length > 0) {
      // Get the pictures to delete
      const picturesToDelete = await prisma.picture.findMany({
        where: {
          id: { in: excludedPictureIds },
          pictureSetId: parseInt(req.params.id),
        },
      });

      // Delete from R2 if configured
      if (isR2Configured()) {
        for (const picture of picturesToDelete) {
          try {
            await deleteFromR2(picture.filePath);
          } catch (err) {
            console.error('Failed to delete from R2:', err);
          }
        }
      } else {
        // Delete local files
        for (const picture of picturesToDelete) {
          try {
            await fs.unlink(picture.filePath);
          } catch (err) {
            console.error('Failed to delete local file:', err);
          }
        }
      }

      // Delete the picture records from database
      await prisma.picture.deleteMany({
        where: {
          id: { in: excludedPictureIds },
          pictureSetId: parseInt(req.params.id),
        },
      });
    }

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
        pictures: {
          orderBy: { displayOrder: 'asc' },
          include: { category: true },
        },
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

// DELETE /api/pictures/:id - Delete picture set
// - Owner can delete non-approved sets (PENDING, CLASSIFIED, REJECTED)
// - Branche can delete non-approved sets from districts they have access to
// - Admin can delete any set (including APPROVED)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        pictures: true,
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

    const isOwner = pictureSet.uploadedById === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    const isBranche = req.user.role === 'BRANCHE_ECLAIREURS';
    const isApproved = pictureSet.status === 'APPROVED';

    // Check permissions
    if (isApproved) {
      // Only admin can delete approved sets
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only administrators can delete approved picture sets' });
      }
    } else {
      // Non-approved: owner, branche (with district access), or admin can delete
      if (!isOwner && !isAdmin) {
        if (isBranche) {
          // SECURITY: Verify branche has district access
          const userDistrictAccess = await prisma.userDistrictAccess.findMany({
            where: { userId: req.user.id },
            select: { districtId: true },
          });
          const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
          const pictureDistrictId = pictureSet.troupe?.group?.district?.id;

          if (allowedDistrictIds.length === 0 || !allowedDistrictIds.includes(pictureDistrictId)) {
            return res.status(403).json({ error: 'You do not have access to delete pictures from this district' });
          }
        } else {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }
    }

    // Delete files from storage (B2 or local)
    for (const picture of pictureSet.pictures) {
      try {
        console.log(`Deleting file: ${picture.filePath}`);
        if (picture.filePath.startsWith('http')) {
          // B2 storage - delete from cloud
          await deleteFromR2(picture.filePath);
          console.log(`Successfully deleted from B2: ${picture.filePath}`);
        } else {
          // Local storage - delete from filesystem
          await fs.unlink(picture.filePath).catch(() => {});
          console.log(`Successfully deleted local file: ${picture.filePath}`);
        }
      } catch (fileError) {
        console.error(`Failed to delete file ${picture.filePath}:`, fileError.message);
      }
    }

    await prisma.pictureSet.delete({
      where: { id: parseInt(req.params.id) },
    });

    res.json({ message: 'Picture set deleted successfully' });
  } catch (error) {
    console.error('Delete picture set error:', error);
    res.status(500).json({ error: 'Failed to delete picture set' });
  }
});

// DELETE /api/pictures/:id/picture/:pictureId - Delete individual picture from a set
// - Owner can delete from non-approved sets
// - Branche can delete from non-approved sets (with district access)
// - Admin can delete from any set
router.delete('/:id/picture/:pictureId', authenticate, async (req, res) => {
  try {
    const { id, pictureId } = req.params;

    const pictureSet = await prisma.pictureSet.findUnique({
      where: { id: parseInt(id) },
      include: {
        pictures: true,
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

    const picture = pictureSet.pictures.find(p => p.id === parseInt(pictureId));
    if (!picture) {
      return res.status(404).json({ error: 'Picture not found in this set' });
    }

    const isOwner = pictureSet.uploadedById === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    const isBranche = req.user.role === 'BRANCHE_ECLAIREURS';
    const isApproved = pictureSet.status === 'APPROVED';

    // Check permissions
    if (isApproved) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only administrators can delete pictures from approved sets' });
      }
    } else {
      if (!isOwner && !isAdmin) {
        if (isBranche) {
          // SECURITY: Verify branche has district access
          const userDistrictAccess = await prisma.userDistrictAccess.findMany({
            where: { userId: req.user.id },
            select: { districtId: true },
          });
          const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
          const pictureDistrictId = pictureSet.troupe?.group?.district?.id;

          if (allowedDistrictIds.length === 0 || !allowedDistrictIds.includes(pictureDistrictId)) {
            return res.status(403).json({ error: 'You do not have access to delete pictures from this district' });
          }
        } else {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }
    }

    // Prevent deleting last picture (set must have at least one picture)
    if (pictureSet.pictures.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last picture. Delete the entire set instead.' });
    }

    // Delete file from storage
    try {
      if (picture.filePath.startsWith('http')) {
        await deleteFromR2(picture.filePath);
      } else {
        await fs.unlink(picture.filePath).catch(() => {});
      }
    } catch (fileError) {
      console.error(`Failed to delete file ${picture.filePath}:`, fileError);
    }

    // Delete picture record
    await prisma.picture.delete({
      where: { id: parseInt(pictureId) },
    });

    // Reorder remaining pictures
    const remainingPictures = pictureSet.pictures
      .filter(p => p.id !== parseInt(pictureId))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    await Promise.all(
      remainingPictures.map((pic, index) =>
        prisma.picture.update({
          where: { id: pic.id },
          data: { displayOrder: index + 1 },
        })
      )
    );

    res.json({ message: 'Picture deleted successfully' });
  } catch (error) {
    console.error('Delete picture error:', error);
    res.status(500).json({ error: 'Failed to delete picture' });
  }
});

// GET /api/pictures/individual - Get individual pictures (admin only)
router.get('/individual/list', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const {
      status,
      categoryId,
      type,
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
    } = req.query;

    // Build where clause for picture sets (status filter)
    const pictureSetWhere = {};
    if (status) pictureSetWhere.status = status;

    // Build where clause for pictures
    const pictureWhere = {
      pictureSet: pictureSetWhere,
    };
    if (categoryId) pictureWhere.categoryId = parseInt(categoryId);
    // Type is now per-picture, not per-set
    if (type) pictureWhere.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build orderBy based on sortBy parameter
    let orderBy = { uploadedAt: sortOrder };
    if (sortBy === 'district') {
      orderBy = { pictureSet: { troupe: { group: { district: { name: sortOrder } } } } };
    } else if (sortBy === 'group') {
      orderBy = { pictureSet: { troupe: { group: { name: sortOrder } } } };
    } else if (sortBy === 'troupe') {
      orderBy = { pictureSet: { troupe: { name: sortOrder } } };
    } else if (sortBy === 'category') {
      orderBy = { category: { name: sortOrder } };
    } else if (sortBy === 'type') {
      orderBy = { type: sortOrder }; // Sort by Picture.type now
    } else if (sortBy === 'uploadedAt') {
      orderBy = { uploadedAt: sortOrder };
    }

    const [pictures, total] = await Promise.all([
      prisma.picture.findMany({
        where: pictureWhere,
        include: {
          category: true,
          pictureSet: {
            include: {
              uploadedBy: { select: { id: true, name: true } },
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
        orderBy,
        skip,
        take: parseInt(limit),
      }),
      prisma.picture.count({ where: pictureWhere }),
    ]);

    res.json({
      pictures,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get individual pictures error:', error);
    res.status(500).json({ error: 'Failed to fetch pictures' });
  }
});

// PUT /api/pictures/individual/bulk-update - Bulk update individual pictures (admin only)
// NOTE: This route MUST be defined BEFORE /individual/:pictureId to avoid "bulk-update" being matched as a pictureId
router.put('/individual/bulk-update', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { pictureIds, updates } = req.body;

    if (!Array.isArray(pictureIds) || pictureIds.length === 0) {
      return res.status(400).json({ error: 'No pictures selected' });
    }

    if (!updates || (updates.type === undefined && updates.categoryId === undefined)) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    // Build the update data
    const updateData = {};
    if (updates.type !== undefined) {
      updateData.type = updates.type;
    }
    if (updates.categoryId !== undefined) {
      updateData.categoryId = updates.categoryId ? parseInt(updates.categoryId) : null;
    }

    // Perform bulk update
    const result = await prisma.picture.updateMany({
      where: {
        id: { in: pictureIds.map(id => parseInt(id)) },
      },
      data: updateData,
    });

    res.json({
      message: `Updated ${result.count} picture(s)`,
      count: result.count,
    });
  } catch (error) {
    console.error('Bulk update pictures error:', error);
    res.status(500).json({ error: 'Failed to update pictures' });
  }
});

// DELETE /api/pictures/individual/bulk-delete - Bulk delete individual pictures (admin only)
// NOTE: This route MUST be defined BEFORE /individual/:pictureId to avoid "bulk-delete" being matched as a pictureId
router.delete('/individual/bulk-delete', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { pictureIds } = req.body;

    if (!Array.isArray(pictureIds) || pictureIds.length === 0) {
      return res.status(400).json({ error: 'No pictures selected' });
    }

    // Get all pictures to delete (with their file paths and set info)
    const pictures = await prisma.picture.findMany({
      where: {
        id: { in: pictureIds.map(id => parseInt(id)) },
      },
      include: {
        pictureSet: {
          include: { pictures: { select: { id: true } } },
        },
      },
    });

    // Check which pictures can be deleted (not the last in their set)
    const deletablePictures = [];
    const skippedPictures = [];

    for (const picture of pictures) {
      const otherPicturesInSet = picture.pictureSet.pictures.filter(p =>
        !pictureIds.includes(p.id) && p.id !== picture.id
      );

      if (otherPicturesInSet.length === 0 && picture.pictureSet.pictures.length <= 1) {
        skippedPictures.push({
          id: picture.id,
          reason: 'Last picture in set',
          pictureSetId: picture.pictureSetId,
        });
      } else {
        deletablePictures.push(picture);
      }
    }

    // Delete files from storage
    for (const picture of deletablePictures) {
      try {
        if (picture.filePath.startsWith('http')) {
          await deleteFromR2(picture.filePath);
        } else {
          await fs.unlink(picture.filePath).catch(() => {});
        }
      } catch (fileError) {
        console.error(`Failed to delete file ${picture.filePath}:`, fileError);
      }
    }

    // Delete picture records
    const deleteResult = await prisma.picture.deleteMany({
      where: {
        id: { in: deletablePictures.map(p => p.id) },
      },
    });

    res.json({
      message: `Deleted ${deleteResult.count} picture(s)`,
      deleted: deleteResult.count,
      skipped: skippedPictures,
    });
  } catch (error) {
    console.error('Bulk delete pictures error:', error);
    res.status(500).json({ error: 'Failed to delete pictures' });
  }
});

// PUT /api/pictures/individual/:pictureId - Update individual picture (admin or branche with district access)
router.put('/individual/:pictureId', authenticate, authorize('ADMIN', 'BRANCHE_ECLAIREURS'), async (req, res) => {
  try {
    const { pictureId } = req.params;
    const { categoryId, takenAt, woodCount, type } = req.body;

    const picture = await prisma.picture.findUnique({
      where: { id: parseInt(pictureId) },
      include: {
        pictureSet: {
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
    });

    if (!picture) {
      return res.status(404).json({ error: 'Picture not found' });
    }

    // For BRANCHE_ECLAIREURS, verify district access
    if (req.user.role === 'BRANCHE_ECLAIREURS') {
      const userDistrictAccess = await prisma.userDistrictAccess.findMany({
        where: { userId: req.user.id },
        select: { districtId: true },
      });
      const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
      const pictureDistrictId = picture.pictureSet.troupe?.group?.district?.id;

      // SECURITY: Deny-by-default - branche must have explicit district access
      if (allowedDistrictIds.length === 0 || !allowedDistrictIds.includes(pictureDistrictId)) {
        return res.status(403).json({ error: 'You do not have access to edit pictures from this district' });
      }
    }

    const updateData = {};
    if (categoryId !== undefined) {
      updateData.categoryId = categoryId ? parseInt(categoryId) : null;
    }
    if (takenAt !== undefined) {
      updateData.takenAt = takenAt ? new Date(takenAt) : null;
    }
    if (woodCount !== undefined) {
      updateData.woodCount = woodCount ? parseInt(woodCount) : null;
    }
    // Type is now per-picture, not per-set
    if (type !== undefined) {
      updateData.type = type && ['INSTALLATION_PHOTO', 'SCHEMATIC'].includes(type) ? type : null;
    }

    // Update picture
    const updatedPicture = await prisma.picture.update({
      where: { id: parseInt(pictureId) },
      data: updateData,
      include: {
        category: true,
        pictureSet: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
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
    });

    res.json({
      message: 'Picture updated successfully',
      picture: updatedPicture,
    });
  } catch (error) {
    console.error('Update picture error:', error);
    res.status(500).json({ error: 'Failed to update picture' });
  }
});

// GET /api/pictures/:pictureId/image-proxy - Proxy image for canvas editing (CORS-safe)
router.get('/:pictureId/image-proxy', authenticate, async (req, res) => {
  try {
    const { pictureId } = req.params;

    const picture = await prisma.picture.findUnique({
      where: { id: parseInt(pictureId) },
      include: {
        pictureSet: true,
      },
    });

    if (!picture) {
      return res.status(404).json({ error: 'Picture not found' });
    }

    // Set CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Cache-Control', 'public, max-age=3600');

    const filePath = picture.filePath;

    if (filePath.startsWith('http')) {
      // R2/CDN URL - fetch and proxy
      const response = await fetch(filePath);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch image' });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.header('Content-Type', contentType);

      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } else {
      // Local file - send directly
      const absolutePath = path.join(__dirname, '../../', filePath);
      res.sendFile(absolutePath);
    }
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// PUT /api/pictures/:pictureId/edit-image - Replace picture with edited version
// - Owner can edit from non-approved sets (PENDING, CLASSIFIED)
// - Branche can edit from CLASSIFIED sets (during review)
// - Admin can edit any set
router.put(
  '/:pictureId/edit-image',
  authenticate,
  upload.single('picture'),
  handleUploadError,
  async (req, res) => {
    try {
      const { pictureId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const picture = await prisma.picture.findUnique({
        where: { id: parseInt(pictureId) },
        include: {
          pictureSet: {
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
      });

      if (!picture) {
        return res.status(404).json({ error: 'Picture not found' });
      }

      const isOwner = picture.pictureSet.uploadedById === req.user.id;
      const isAdmin = req.user.role === 'ADMIN';
      const isBranche = req.user.role === 'BRANCHE_ECLAIREURS';
      const status = picture.pictureSet.status;

      // Check permissions
      let canEdit = false;
      if (isAdmin) {
        canEdit = true;
      } else if (isBranche && (status === 'CLASSIFIED' || status === 'PENDING')) {
        // Branche can edit during review (CLASSIFIED) or classification (PENDING)
        // Check district access
        const userDistrictAccess = await prisma.userDistrictAccess.findMany({
          where: { userId: req.user.id },
          select: { districtId: true },
        });
        const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
        const pictureDistrictId = picture.pictureSet.troupe?.group?.district?.id;
        canEdit = allowedDistrictIds.length === 0 || allowedDistrictIds.includes(pictureDistrictId);
      } else if (isOwner && (status === 'PENDING' || status === 'CLASSIFIED')) {
        canEdit = true;
      }

      if (!canEdit) {
        return res.status(403).json({
          error: 'You do not have permission to edit this picture',
        });
      }

      const oldFilePath = picture.filePath;
      let originalFilePath = picture.originalFilePath;

      // PRESERVE ORIGINAL: On first edit, save the original path and keep the file
      if (!originalFilePath) {
        // First edit - preserve the original file path
        originalFilePath = oldFilePath;
        // DO NOT delete the original file - keep it for restoration
      } else {
        // Subsequent edit - delete the previous edited version (but not the original)
        if (oldFilePath !== originalFilePath) {
          try {
            if (oldFilePath.startsWith('http')) {
              await deleteFromR2(oldFilePath);
            } else {
              await fs.unlink(oldFilePath).catch(() => {});
            }
          } catch (fileError) {
            console.error(`Failed to delete old edited file ${oldFilePath}:`, fileError);
          }
        }
      }

      // Handle new file path based on storage type (R2 or local)
      let newFilePath;

      if (isR2Configured()) {
        // Upload to R2
        const { uploadToR2 } = await import('../services/r2Storage.js');
        const result = await uploadToR2(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
        newFilePath = result.url;
      } else {
        // Local storage - file is already saved by multer
        const relativePath = req.file.path.replace(/\\/g, '/').split('/uploads/').pop();
        newFilePath = `uploads/${relativePath}`;
      }

      // Update picture record with new file path and preserve original
      const updatedPicture = await prisma.picture.update({
        where: { id: parseInt(pictureId) },
        data: {
          filePath: newFilePath,
          originalFilePath: originalFilePath
        },
        include: {
          category: true,
          pictureSet: {
            include: {
              uploadedBy: { select: { id: true, name: true } },
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
      });

      res.json({
        message: 'Picture updated successfully',
        picture: updatedPicture,
        hasOriginal: !!originalFilePath
      });
    } catch (error) {
      console.error('Edit picture error:', error);
      res.status(500).json({ error: 'Failed to edit picture' });
    }
  }
);

// POST /api/pictures/:pictureId/restore-original - Restore original image
router.post(
  '/:pictureId/restore-original',
  authenticate,
  async (req, res) => {
    try {
      const { pictureId } = req.params;

      const picture = await prisma.picture.findUnique({
        where: { id: parseInt(pictureId) },
        include: {
          pictureSet: {
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
      });

      if (!picture) {
        return res.status(404).json({ error: 'Picture not found' });
      }

      if (!picture.originalFilePath) {
        return res.status(400).json({ error: 'No original image available to restore' });
      }

      // Permission check (same as edit-image)
      const isOwner = picture.pictureSet.uploadedById === req.user.id;
      const isAdmin = req.user.role === 'ADMIN';
      const isBranche = req.user.role === 'BRANCHE_ECLAIREURS';
      const status = picture.pictureSet.status;

      let canEdit = false;
      if (isAdmin) {
        canEdit = true;
      } else if (isBranche && (status === 'CLASSIFIED' || status === 'PENDING')) {
        const userDistrictAccess = await prisma.userDistrictAccess.findMany({
          where: { userId: req.user.id },
          select: { districtId: true },
        });
        const allowedDistrictIds = userDistrictAccess.map(uda => uda.districtId);
        const pictureDistrictId = picture.pictureSet.troupe?.group?.district?.id;
        canEdit = allowedDistrictIds.length === 0 || allowedDistrictIds.includes(pictureDistrictId);
      } else if (isOwner && (status === 'PENDING' || status === 'CLASSIFIED')) {
        canEdit = true;
      }

      if (!canEdit) {
        return res.status(403).json({
          error: 'You do not have permission to restore this picture',
        });
      }

      // Delete the current edited file (but not the original)
      const currentFilePath = picture.filePath;
      if (currentFilePath !== picture.originalFilePath) {
        try {
          if (currentFilePath.startsWith('http')) {
            await deleteFromR2(currentFilePath);
          } else {
            await fs.unlink(currentFilePath).catch(() => {});
          }
        } catch (fileError) {
          console.error(`Failed to delete edited file ${currentFilePath}:`, fileError);
        }
      }

      // Restore: set filePath back to originalFilePath, clear originalFilePath
      const restoredPicture = await prisma.picture.update({
        where: { id: parseInt(pictureId) },
        data: {
          filePath: picture.originalFilePath,
          originalFilePath: null
        },
        include: {
          category: true,
          pictureSet: {
            include: {
              uploadedBy: { select: { id: true, name: true } },
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
      });

      res.json({
        message: 'Original image restored successfully',
        picture: restoredPicture,
        hasOriginal: false
      });
    } catch (error) {
      console.error('Restore original error:', error);
      res.status(500).json({ error: 'Failed to restore original image' });
    }
  }
);

// GET /api/pictures/:pictureId/has-original - Check if picture has original available
router.get(
  '/:pictureId/has-original',
  authenticate,
  async (req, res) => {
    try {
      const { pictureId } = req.params;

      const picture = await prisma.picture.findUnique({
        where: { id: parseInt(pictureId) },
        select: { originalFilePath: true }
      });

      if (!picture) {
        return res.status(404).json({ error: 'Picture not found' });
      }

      res.json({ hasOriginal: !!picture.originalFilePath });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check original status' });
    }
  }
);

// DELETE /api/pictures/individual/:pictureId - Delete individual picture (admin only)
router.delete('/individual/:pictureId', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { pictureId } = req.params;

    const picture = await prisma.picture.findUnique({
      where: { id: parseInt(pictureId) },
      include: { pictureSet: { include: { pictures: true } } },
    });

    if (!picture) {
      return res.status(404).json({ error: 'Picture not found' });
    }

    // Prevent deleting last picture in a set
    if (picture.pictureSet.pictures.length <= 1) {
      return res.status(400).json({
        error: 'Cannot delete the last picture in a set. Delete the entire picture set instead.',
        pictureSetId: picture.pictureSetId,
      });
    }

    // Delete file from storage
    try {
      if (picture.filePath.startsWith('http')) {
        await deleteFromR2(picture.filePath);
      } else {
        await fs.unlink(picture.filePath).catch(() => {});
      }
    } catch (fileError) {
      console.error(`Failed to delete file ${picture.filePath}:`, fileError);
    }

    // Delete picture record
    await prisma.picture.delete({
      where: { id: parseInt(pictureId) },
    });

    res.json({ message: 'Picture deleted successfully' });
  } catch (error) {
    console.error('Delete individual picture error:', error);
    res.status(500).json({ error: 'Failed to delete picture' });
  }
});

export default router;

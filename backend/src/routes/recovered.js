// Admin endpoints for the "Recovered" holding area.
//
// When a Picture row is lost but its B2 file survives, scripts/importOrphansToRecovery.js
// stages it as a RecoveredFile (status=PENDING). Admin reviews each one in
// /admin/recovered, sets type/troupe/patrouille/category, then either
// promotes it back to a real PictureSet+Picture or discards it.
//
// Promote creates a NEW PictureSet (status PENDING by default) with one
// Picture pointing at the existing B2 URL. The B2 object is not moved or
// re-uploaded — we just re-attach the DB row that was lost.

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { logPictureAudit, PictureAuditAction } from '../utils/pictureAudit.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/admin/recovered — list recovered files (admin only)
// Query: status (PENDING|PROMOTED|DISCARDED), page, limit
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const status = req.query.status || 'PENDING';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const where = ['PENDING', 'PROMOTED', 'DISCARDED'].includes(status) ? { status } : {};

    const [items, total, counts] = await Promise.all([
      prisma.recoveredFile.findMany({
        where,
        orderBy: [{ lastModifiedB2: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.recoveredFile.count({ where }),
      prisma.recoveredFile.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    // Resolve hint troupe names so the UI can show a helpful pre-fill
    const troupeIds = [...new Set(items.map((i) => i.hintTroupeId).filter(Boolean))];
    const uploaderIds = [...new Set(items.map((i) => i.hintUploaderId).filter(Boolean))];

    const [troupes, uploaders] = await Promise.all([
      troupeIds.length
        ? prisma.troupe.findMany({
            where: { id: { in: troupeIds } },
            select: { id: true, name: true, group: { select: { name: true, district: { select: { name: true } } } } },
          })
        : [],
      uploaderIds.length
        ? prisma.user.findMany({
            where: { id: { in: uploaderIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
    ]);
    const troupeMap = new Map(troupes.map((t) => [t.id, t]));
    const uploaderMap = new Map(uploaders.map((u) => [u.id, u]));

    const enriched = items.map((i) => ({
      ...i,
      hintTroupe: i.hintTroupeId ? troupeMap.get(i.hintTroupeId) || null : null,
      hintUploader: i.hintUploaderId ? uploaderMap.get(i.hintUploaderId) || null : null,
    }));

    const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

    res.json({
      items: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts: {
        PENDING: countMap.PENDING || 0,
        PROMOTED: countMap.PROMOTED || 0,
        DISCARDED: countMap.DISCARDED || 0,
      },
    });
  } catch (error) {
    console.error('List recovered files error:', error);
    res.status(500).json({ error: 'Failed to list recovered files' });
  }
});

// POST /api/admin/recovered/:id/promote — restore the file as a real PictureSet
// Body: { type, troupeId, patrouilleId?, categoryId?, title?, uploaderId? }
router.post('/:id/promote', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { type, troupeId, patrouilleId, categoryId, title, uploaderId } = req.body;

    if (!type || !['INSTALLATION_PHOTO', 'SCHEMATIC'].includes(type)) {
      return res.status(400).json({ error: 'type must be INSTALLATION_PHOTO or SCHEMATIC' });
    }
    if (!troupeId) {
      return res.status(400).json({ error: 'troupeId is required' });
    }
    if (type === 'SCHEMATIC' && !patrouilleId) {
      return res.status(400).json({ error: 'patrouilleId is required for SCHEMATIC' });
    }

    const recovered = await prisma.recoveredFile.findUnique({ where: { id } });
    if (!recovered) return res.status(404).json({ error: 'Recovered file not found' });
    if (recovered.status !== 'PENDING') {
      return res.status(400).json({ error: `Already ${recovered.status.toLowerCase()}` });
    }

    // Validate troupe + (optional) patrouille belongs to that troupe
    const troupe = await prisma.troupe.findUnique({
      where: { id: parseInt(troupeId) },
      include: { group: { include: { district: true } } },
    });
    if (!troupe) return res.status(400).json({ error: 'Invalid troupeId' });

    if (patrouilleId) {
      const patrouille = await prisma.patrouille.findUnique({ where: { id: parseInt(patrouilleId) } });
      if (!patrouille || patrouille.troupeId !== troupe.id) {
        return res.status(400).json({ error: 'patrouilleId does not belong to that troupe' });
      }
    }
    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: parseInt(categoryId) } });
      if (!cat) return res.status(400).json({ error: 'Invalid categoryId' });
    }

    // Pick an uploader: prefer explicit, then audit hint, then current admin
    let resolvedUploaderId = uploaderId ? parseInt(uploaderId) : null;
    if (!resolvedUploaderId && recovered.hintUploaderId) {
      const u = await prisma.user.findUnique({ where: { id: recovered.hintUploaderId } });
      if (u && u.isActive) resolvedUploaderId = u.id;
    }
    if (!resolvedUploaderId) resolvedUploaderId = req.user.id;

    // Title: explicit > "Recovered_<District>_<Group>_<Troupe>_<id>"
    const finalTitle =
      title ||
      `Recovered_${troupe.group.district.name}_${troupe.group.name}_${troupe.name}_${recovered.id}`;

    const result = await prisma.$transaction(async (tx) => {
      const set = await tx.pictureSet.create({
        data: {
          title: finalTitle,
          type,
          status: 'PENDING', // admin can run normal classify/approve afterwards
          uploadedById: resolvedUploaderId,
          troupeId: troupe.id,
          patrouilleId: patrouilleId ? parseInt(patrouilleId) : null,
          categoryId: categoryId ? parseInt(categoryId) : null,
          pictures: {
            create: [
              {
                filePath: recovered.fileUrl,
                displayOrder: 1,
                type,
                categoryId: categoryId ? parseInt(categoryId) : null,
              },
            ],
          },
        },
        include: { pictures: true },
      });

      await tx.recoveredFile.update({
        where: { id: recovered.id },
        data: {
          status: 'PROMOTED',
          promotedSetId: set.id,
          promotedAt: new Date(),
          promotedById: req.user.id,
        },
      });

      return set;
    });

    // Audit the (re-)attachment so the B2 key shows up in the normal audit trail
    for (const pic of result.pictures) {
      await logPictureAudit(prisma, {
        action: PictureAuditAction.UPLOADED,
        pictureId: pic.id,
        pictureSetId: result.id,
        uploaderId: result.uploadedById,
        troupeId: result.troupeId,
        actorId: req.user.id,
        actorRole: req.user.role,
        pictureSetStatusAtAction: result.status,
        filePath: pic.filePath,
        details: {
          source: 'RECOVERED',
          recoveredFileId: recovered.id,
          type: result.type,
          troupeName: troupe.name,
          groupId: troupe.group.id,
          groupName: troupe.group.name,
          districtId: troupe.group.district.id,
          districtName: troupe.group.district.name,
          patrouilleId: result.patrouilleId,
          categoryId: result.categoryId,
        },
      });
    }

    res.json({ message: 'Restored', pictureSet: result });
  } catch (error) {
    console.error('Promote recovered file error:', error);
    res.status(500).json({ error: 'Failed to promote recovered file' });
  }
});

// POST /api/admin/recovered/:id/discard — mark as not worth recovering
// (does NOT delete the B2 object; that's a separate manual step)
router.post('/:id/discard', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { notes } = req.body;

    const recovered = await prisma.recoveredFile.findUnique({ where: { id } });
    if (!recovered) return res.status(404).json({ error: 'Recovered file not found' });
    if (recovered.status !== 'PENDING') {
      return res.status(400).json({ error: `Already ${recovered.status.toLowerCase()}` });
    }

    const updated = await prisma.recoveredFile.update({
      where: { id },
      data: {
        status: 'DISCARDED',
        discardedAt: new Date(),
        discardedById: req.user.id,
        notes: notes || recovered.notes,
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Discard recovered file error:', error);
    res.status(500).json({ error: 'Failed to discard recovered file' });
  }
});

// POST /api/admin/recovered/:id/restore-pending — undo a discard, re-open
router.post('/:id/restore-pending', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const recovered = await prisma.recoveredFile.findUnique({ where: { id } });
    if (!recovered) return res.status(404).json({ error: 'Recovered file not found' });
    if (recovered.status !== 'DISCARDED') {
      return res.status(400).json({ error: 'Only discarded items can be restored to PENDING' });
    }
    const updated = await prisma.recoveredFile.update({
      where: { id },
      data: { status: 'PENDING', discardedAt: null, discardedById: null },
    });
    res.json(updated);
  } catch (error) {
    console.error('Restore-pending recovered file error:', error);
    res.status(500).json({ error: 'Failed to restore recovered file' });
  }
});

export default router;

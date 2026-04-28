// Import orphan B2 files (from reconcileOrphanedB2Files.js report) into the
// RecoveredFile table. From there an admin can classify them in /admin/recovered
// and promote each one back to a real PictureSet + Picture, or discard.
//
// Idempotent: uses fileKey as a unique key, so re-running just upserts.
// Pre-fills audit hints (troupe, uploader, action) from PictureAudit when the
// file is referenced there — that's how admins see "this file was lost on
// 2026-04-12 from troupe Aigles by user Marie".
//
// Usage (from backend/):
//   node scripts/importOrphansToRecovery.js                                  # newest report in ./reports
//   node scripts/importOrphansToRecovery.js --report=./reports/b2-reconcile-2026-04-28....json
//   node scripts/importOrphansToRecovery.js --dry-run

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { isR2Configured, getPublicUrl, thumbnailKeyFor } from '../src/services/r2Storage.js';

const prisma = new PrismaClient();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const DRY_RUN = !!args['dry-run'];

if (!isR2Configured()) {
  console.error('B2 is not configured — set B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY in .env');
  process.exit(1);
}

async function findLatestReport() {
  const dir = './reports';
  const entries = await fs.readdir(dir).catch(() => []);
  const candidates = entries
    .filter((f) => f.startsWith('b2-reconcile-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (!candidates.length) {
    throw new Error('No reconciliation report found in ./reports — run reconcileOrphanedB2Files.js first');
  }
  return path.join(dir, candidates[0]);
}

async function main() {
  const reportPath = args.report || (await findLatestReport());
  console.log(`Reading: ${reportPath}`);
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

  const orphans = report.orphanOriginals || [];
  console.log(`Orphan originals in report: ${orphans.length}`);

  // Build a map of B2 thumbnail keys present so we can attach the matching one
  const orphanThumbKeys = new Set((report.orphanThumbs || []).map((t) => t.key));

  // Pre-load all audit rows once and build a key→audit map.
  const audits = await prisma.pictureAudit.findMany({
    select: {
      filePath: true,
      action: true,
      uploaderId: true,
      troupeId: true,
      createdAt: true,
    },
    where: { filePath: { not: null } },
    orderBy: { createdAt: 'desc' }, // newest first → we keep the most recent hit
  });
  const auditByFilePath = new Map();
  for (const a of audits) {
    if (!auditByFilePath.has(a.filePath)) auditByFilePath.set(a.filePath, a);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const orphan of orphans) {
    const fileKey = orphan.key;
    const fileUrl = getPublicUrl(fileKey);
    const thumbKey = thumbnailKeyFor(fileKey);
    const hasThumb = orphanThumbKeys.has(thumbKey);

    // Try to find an audit record that referenced this file. PictureAudit.filePath
    // can be either the full URL or the bare key, so check both.
    const audit = auditByFilePath.get(fileUrl) || auditByFilePath.get(fileKey) || null;

    const data = {
      fileKey,
      fileUrl,
      thumbKey: hasThumb ? thumbKey : null,
      thumbUrl: hasThumb ? getPublicUrl(thumbKey) : null,
      sizeBytes: orphan.sizeBytes ?? null,
      lastModifiedB2: orphan.lastModified ? new Date(orphan.lastModified) : null,
      hintTroupeId: audit?.troupeId ?? null,
      hintUploaderId: audit?.uploaderId ?? null,
      hintAction: audit?.action ?? null,
      hintAuditAt: audit?.createdAt ?? null,
    };

    if (DRY_RUN) {
      console.log(`[dry] would upsert ${fileKey} (audit: ${audit ? 'yes' : 'no'})`);
      skipped += 1;
      continue;
    }

    const existing = await prisma.recoveredFile.findUnique({ where: { fileKey } });
    if (existing) {
      // Don't overwrite admin work that's already in progress (PROMOTED/DISCARDED).
      if (existing.status !== 'PENDING') {
        skipped += 1;
        continue;
      }
      await prisma.recoveredFile.update({ where: { fileKey }, data });
      updated += 1;
    } else {
      await prisma.recoveredFile.create({ data });
      created += 1;
    }
  }

  console.log('');
  console.log('===== Summary =====');
  console.log(`Created:  ${created}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Find B2 objects that have no matching Picture row in the database.
//
// Symptom this targets: a PictureSet was deleted from the DB but its files
// were left behind on B2 (e.g. when filePath didn't start with "http" so the
// delete code path tried fs.unlink instead of deleteFromR2). The objects in
// B2 are orphans — recoverable, but invisible to the app.
//
// What it does:
//   1. List every object under `pictures/` in the bucket.
//   2. Load every Picture.filePath from the DB and convert to bucket keys.
//   3. Diff: any B2 key not referenced by a Picture row is an orphan.
//   4. Thumbnails (`*-thumb.webp`) are paired with their original — an orphan
//      original implies its thumb is also orphaned and is reported once.
//   5. Writes a JSON + CSV report; never deletes or moves anything.
//
// Usage (from backend/):
//   node scripts/reconcileOrphanedB2Files.js
//   node scripts/reconcileOrphanedB2Files.js --out=./reports
//   node scripts/reconcileOrphanedB2Files.js --prefix=pictures/2026/
//
// Read-only. Safe to run anytime.

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { isR2Configured, keyFromPublicUrl, thumbnailKeyFor } from '../src/services/r2Storage.js';

const prisma = new PrismaClient();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const OUT_DIR = args.out || './reports';
const PREFIX = args.prefix || 'pictures/';

if (!isR2Configured()) {
  console.error('B2 is not configured — set B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY in .env');
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: `https://${process.env.B2_ENDPOINT}`,
  region: 'us-west-004',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
});
const BUCKET = process.env.B2_BUCKET_NAME;

const isThumbKey = (key) => key.endsWith('-thumb.webp');

async function listAllB2Objects() {
  const objects = [];
  let continuationToken = undefined;
  let page = 0;
  do {
    page += 1;
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents || []) {
      objects.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    process.stdout.write(`\r  listed ${objects.length} objects (page ${page})`);
  } while (continuationToken);
  process.stdout.write('\n');
  return objects;
}

async function loadDbKeys() {
  const referenced = new Set();
  const malformed = [];

  // Pictures table — current live references
  const pictures = await prisma.picture.findMany({
    select: { id: true, filePath: true, pictureSetId: true, isArchived: true },
  });
  for (const p of pictures) {
    const key = keyFromPublicUrl(p.filePath);
    if (!key) {
      malformed.push({ pictureId: p.id, filePath: p.filePath });
      continue;
    }
    referenced.add(key);
    referenced.add(thumbnailKeyFor(key));
  }

  // PictureAudit — historical references; useful to identify what a recovered
  // orphan used to belong to (status, troupe, set) even after the DB row is gone.
  const audits = await prisma.pictureAudit.findMany({
    select: { filePath: true },
    where: { filePath: { not: null } },
  });
  const auditKeyToRow = new Map();
  for (const a of audits) {
    const key = keyFromPublicUrl(a.filePath);
    if (key) auditKeyToRow.set(key, a);
  }

  return { referenced, malformed, pictureCount: pictures.length, auditKeyToRow };
}

async function main() {
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log('');

  console.log('Listing B2 objects...');
  const b2Objects = await listAllB2Objects();
  console.log(`  total: ${b2Objects.length}`);

  console.log('Loading DB references...');
  const { referenced, malformed, pictureCount, auditKeyToRow } = await loadDbKeys();
  console.log(`  Picture rows: ${pictureCount}`);
  console.log(`  referenced B2 keys (incl. thumbs): ${referenced.size}`);
  console.log(`  Picture rows with unparseable filePath: ${malformed.length}`);

  // Diff
  const orphanOriginals = [];
  const orphanThumbs = [];
  let totalOrphanBytes = 0;

  for (const obj of b2Objects) {
    if (referenced.has(obj.key)) continue;
    if (isThumbKey(obj.key)) {
      orphanThumbs.push(obj);
    } else {
      orphanOriginals.push(obj);
      totalOrphanBytes += obj.size || 0;
    }
  }

  // Enrich orphan originals with audit info if any
  const enriched = orphanOriginals.map((obj) => {
    const audit = auditKeyToRow.get(obj.key);
    return {
      key: obj.key,
      sizeBytes: obj.size,
      lastModified: obj.lastModified,
      hasOrphanedThumb: referenced.has(thumbnailKeyFor(obj.key))
        ? false
        : b2Objects.some((o) => o.key === thumbnailKeyFor(obj.key)),
      auditHit: audit ? true : false,
    };
  });

  // Find missing files: DB row points to a key that doesn't exist in B2
  const b2Keys = new Set(b2Objects.map((o) => o.key));
  const missingFromB2 = [];
  for (const key of referenced) {
    if (isThumbKey(key)) continue; // thumbs are best-effort; ignore
    if (!b2Keys.has(key)) missingFromB2.push(key);
  }

  console.log('');
  console.log('===== Summary =====');
  console.log(`B2 objects:                  ${b2Objects.length}`);
  console.log(`Orphan originals:            ${orphanOriginals.length}  (${(totalOrphanBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Orphan thumbnails:           ${orphanThumbs.length}`);
  console.log(`DB rows with no B2 file:     ${missingFromB2.length}`);
  console.log(`DB rows with bad filePath:   ${malformed.length}`);
  console.log('');

  // Write reports
  await fs.mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUT_DIR, `b2-reconcile-${stamp}.json`);
  const csvPath = path.join(OUT_DIR, `b2-reconcile-orphans-${stamp}.csv`);

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        bucket: BUCKET,
        prefix: PREFIX,
        counts: {
          b2Objects: b2Objects.length,
          orphanOriginals: orphanOriginals.length,
          orphanThumbs: orphanThumbs.length,
          missingFromB2: missingFromB2.length,
          malformed: malformed.length,
        },
        orphanOriginals: enriched,
        orphanThumbs: orphanThumbs.map((o) => ({ key: o.key, sizeBytes: o.size, lastModified: o.lastModified })),
        missingFromB2,
        malformed,
      },
      null,
      2,
    ),
  );

  const csvRows = [
    ['key', 'sizeBytes', 'lastModified', 'hasOrphanedThumb', 'auditHit'],
    ...enriched.map((o) => [
      o.key,
      o.sizeBytes,
      o.lastModified ? new Date(o.lastModified).toISOString() : '',
      o.hasOrphanedThumb,
      o.auditHit,
    ]),
  ];
  await fs.writeFile(csvPath, csvRows.map((r) => r.join(',')).join('\n'));

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Backfill WebP thumbnails for every existing Picture.filePath on B2.
//
// Idempotent & safe to re-run:
//   - skips rows whose filePath isn't an HTTP URL (local dev uploads)
//   - skips rows whose thumbnail already exists in the bucket (HEAD check)
//   - skips non-image extensions (.pdf, etc.)
//   - logs each action and continues on error
//
// Usage (from backend/):
//   node scripts/backfillThumbnails.js                  # process everything
//   node scripts/backfillThumbnails.js --limit=500      # cap for a smoke test
//   node scripts/backfillThumbnails.js --concurrency=4  # tune parallelism
//   node scripts/backfillThumbnails.js --dry-run        # log only
//
// On prod this is kicked off from the deploy workflow after the backend is
// up, so the command needs no interactive input.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  isR2Configured,
  keyFromPublicUrl,
  thumbnailExists,
  generateAndUploadThumbnail,
} from '../src/services/r2Storage.js';

const prisma = new PrismaClient();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 4;
const DRY_RUN = !!args['dry-run'];

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function processOne(pic, stats) {
  const filePath = pic.filePath;
  if (!filePath || !filePath.startsWith('http')) {
    stats.skipped++;
    return;
  }
  if (!IMAGE_EXT.test(filePath)) {
    stats.skipped++;
    return;
  }
  const key = keyFromPublicUrl(filePath);
  if (!key) {
    stats.skipped++;
    return;
  }
  // Already-thumb files shouldn't be in Picture.filePath, but guard anyway.
  if (/-thumb\.webp$/i.test(key)) {
    stats.skipped++;
    return;
  }

  try {
    if (await thumbnailExists(key)) {
      stats.alreadyHad++;
      return;
    }
    if (DRY_RUN) {
      console.log(`[dry] would thumbnail ${key}`);
      stats.wouldGenerate++;
      return;
    }
    const buf = await fetchBuffer(filePath);
    await generateAndUploadThumbnail(buf, key);
    stats.generated++;
    if (stats.generated % 25 === 0) {
      console.log(`  … ${stats.generated} thumbnails generated`);
    }
  } catch (err) {
    stats.failed++;
    console.error(`  ✗ picture ${pic.id} (${key}): ${err?.message || err}`);
  }
}

async function runPool(items, worker, concurrency) {
  let idx = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  if (!isR2Configured()) {
    console.error('B2 is not configured (missing env vars). Aborting.');
    process.exit(1);
  }

  console.log(
    `Backfill thumbnails — concurrency=${CONCURRENCY}${LIMIT ? `, limit=${LIMIT}` : ''}${DRY_RUN ? ', DRY RUN' : ''}`
  );

  const pictures = await prisma.picture.findMany({
    select: { id: true, filePath: true },
    orderBy: { id: 'asc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  console.log(`Loaded ${pictures.length} pictures.`);

  const stats = { generated: 0, alreadyHad: 0, skipped: 0, failed: 0, wouldGenerate: 0 };
  await runPool(pictures, (p) => processOne(p, stats), CONCURRENCY);

  console.log('Done.', stats);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

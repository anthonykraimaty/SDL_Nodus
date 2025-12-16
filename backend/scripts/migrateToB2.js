/**
 * Migration script to move existing local images to Backblaze B2
 *
 * Usage:
 *   node scripts/migrateToB2.js [--dry-run]
 *
 * Options:
 *   --dry-run   Show what would be migrated without actually uploading
 *
 * Prerequisites:
 *   - B2 environment variables must be set (B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, B2_APP_KEY)
 *   - CDN_URL should be set if using Cloudflare
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// B2 Configuration
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_BUCKET = process.env.B2_BUCKET_NAME;
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;
const CDN_URL = process.env.CDN_URL;

const dryRun = process.argv.includes('--dry-run');

// Initialize S3 client for B2
const s3Client = new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: 'us-west-004',
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
});

// MIME types mapping
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

async function uploadToB2(localPath, b2Key) {
  const fileBuffer = await fs.readFile(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: b2Key,
    Body: fileBuffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  });

  await s3Client.send(command);

  // Return the CDN URL
  return CDN_URL ? `${CDN_URL}/${b2Key}` : `https://${B2_BUCKET}.${B2_ENDPOINT}/${b2Key}`;
}

async function migrate() {
  console.log('='.repeat(60));
  console.log('Backblaze B2 Migration Script');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
  }

  // Verify B2 configuration
  if (!B2_ENDPOINT || !B2_BUCKET || !B2_KEY_ID || !B2_APP_KEY) {
    console.error('ERROR: B2 environment variables not set!');
    console.error('Required: B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, B2_APP_KEY');
    process.exit(1);
  }

  console.log(`B2 Endpoint: ${B2_ENDPOINT}`);
  console.log(`B2 Bucket: ${B2_BUCKET}`);
  console.log(`CDN URL: ${CDN_URL || '(not configured)'}`);
  console.log('');

  // Get all pictures with local file paths (not starting with http)
  const pictures = await prisma.picture.findMany({
    where: {
      NOT: {
        filePath: {
          startsWith: 'http',
        },
      },
    },
  });

  console.log(`Found ${pictures.length} pictures with local storage`);

  if (pictures.length === 0) {
    console.log('No pictures to migrate!');
    return;
  }

  const backendRoot = path.join(__dirname, '..');
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const picture of pictures) {
    const localPath = path.join(backendRoot, picture.filePath);

    // Generate B2 key from local path
    // uploads/pictures/2024/12/filename.jpg -> pictures/2024/12/filename.jpg
    const b2Key = picture.filePath.replace(/^uploads\//, '');

    console.log(`\n[${successCount + errorCount + skippedCount + 1}/${pictures.length}] Processing: ${picture.filePath}`);

    // Check if file exists
    try {
      await fs.access(localPath);
    } catch {
      console.log(`  SKIP: File not found locally`);
      skippedCount++;
      continue;
    }

    if (dryRun) {
      console.log(`  DRY RUN: Would upload to B2 as: ${b2Key}`);
      successCount++;
      continue;
    }

    try {
      // Upload to B2
      const newUrl = await uploadToB2(localPath, b2Key);
      console.log(`  Uploaded to: ${newUrl}`);

      // Update database
      await prisma.picture.update({
        where: { id: picture.id },
        data: { filePath: newUrl },
      });
      console.log(`  Database updated`);

      successCount++;
    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total pictures:  ${pictures.length}`);
  console.log(`Successful:      ${successCount}`);
  console.log(`Errors:          ${errorCount}`);
  console.log(`Skipped:         ${skippedCount}`);

  if (dryRun) {
    console.log('\n*** This was a dry run. Run without --dry-run to perform actual migration ***');
  }
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

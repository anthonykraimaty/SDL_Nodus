import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 75;
const THUMBNAIL_SUFFIX = '-thumb.webp';

// Backblaze B2 Configuration (S3-compatible API)
const B2_ENDPOINT = process.env.B2_ENDPOINT; // e.g., s3.us-west-004.backblazeb2.com
const B2_BUCKET = process.env.B2_BUCKET_NAME;
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_PUBLIC_URL = process.env.B2_PUBLIC_URL; // Your B2 friendly URL or CDN

// Initialize S3 client for Backblaze B2
const s3Client = B2_ENDPOINT ? new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: 'us-west-004', // Extract from endpoint or use default
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
}) : null;

/**
 * Check if B2 storage is configured
 */
export const isR2Configured = () => {
  return !!(B2_ENDPOINT && B2_BUCKET && B2_KEY_ID && B2_APPLICATION_KEY);
};

/**
 * Generate a unique file key for B2 storage
 */
const generateFileKey = (originalFilename) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const ext = path.extname(originalFilename).toLowerCase();

  return `pictures/${year}/${month}/${uniqueId}${ext}`;
};

/**
 * Upload a file to Backblaze B2
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} originalFilename - Original filename for extension
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{key: string, url: string}>}
 */
export const uploadToR2 = async (fileBuffer, originalFilename, mimeType) => {
  if (!isR2Configured()) {
    throw new Error('B2 storage is not configured');
  }

  const fileKey = generateFileKey(originalFilename);

  const command = new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: fileKey,
    Body: fileBuffer,
    ContentType: mimeType,
    // Cache for 1 year (images rarely change)
    CacheControl: 'public, max-age=31536000',
  });

  await s3Client.send(command);

  // Return the public URL
  // B2 friendly URL format: https://f004.backblazeb2.com/file/bucket-name/key
  const url = B2_PUBLIC_URL
    ? `${B2_PUBLIC_URL}/${fileKey}`
    : `https://${B2_ENDPOINT}/file/${B2_BUCKET}/${fileKey}`;

  // Fire-and-forget thumbnail generation: never block or fail the main upload.
  // Only images are thumbnailed (PDFs and unknowns are skipped).
  if (mimeType && mimeType.startsWith('image/')) {
    generateAndUploadThumbnail(fileBuffer, fileKey).catch((err) => {
      console.error(`Thumbnail generation failed for ${fileKey}:`, err?.message || err);
    });
  }

  return {
    key: fileKey,
    url: url,
  };
};

/**
 * Derive the thumbnail key from an original file key.
 * e.g. pictures/2026/04/abc.jpg -> pictures/2026/04/abc-thumb.webp
 */
export const thumbnailKeyFor = (originalKey) => {
  if (!originalKey) return null;
  const ext = path.extname(originalKey);
  const base = ext ? originalKey.slice(0, -ext.length) : originalKey;
  return `${base}${THUMBNAIL_SUFFIX}`;
};

/**
 * Resize an image buffer to a small WebP thumbnail and upload it to B2
 * alongside the original under `<key>-thumb.webp`. Idempotent: safe to re-run.
 */
export const generateAndUploadThumbnail = async (fileBuffer, originalKey) => {
  if (!isR2Configured()) {
    throw new Error('B2 storage is not configured');
  }

  const thumbKey = thumbnailKeyFor(originalKey);
  const thumbBuffer = await sharp(fileBuffer)
    .rotate() // honor EXIF orientation
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  await s3Client.send(new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: thumbKey,
    Body: thumbBuffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',
  }));

  const thumbUrl = B2_PUBLIC_URL
    ? `${B2_PUBLIC_URL}/${thumbKey}`
    : `https://${B2_ENDPOINT}/file/${B2_BUCKET}/${thumbKey}`;

  return { key: thumbKey, url: thumbUrl };
};

/**
 * Check whether a thumbnail already exists in B2.
 */
export const thumbnailExists = async (originalKey) => {
  if (!isR2Configured()) return false;
  const thumbKey = thumbnailKeyFor(originalKey);
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: thumbKey }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    // Any other error: treat as "unknown"; backfill will try anyway
    return false;
  }
};

/**
 * Extract the B2 key from a full public URL produced by `uploadToR2`.
 * Returns null if the URL doesn't match a known B2/public-URL shape.
 */
export const keyFromPublicUrl = (fileUrl) => {
  if (!fileUrl) return null;
  if (!fileUrl.startsWith('http')) return fileUrl; // already a key
  try {
    const url = new URL(fileUrl);
    // Friendly URL form: /file/<bucket>/<key>
    const friendly = url.pathname.match(/^\/file\/[^/]+\/(.+)$/);
    if (friendly) return friendly[1];
    // B2_PUBLIC_URL form: the whole pathname is the key
    return url.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
};

/**
 * Delete a file from Backblaze B2
 * @param {string} fileKey - The file key in B2 or full URL
 */
export const deleteFromR2 = async (fileKey) => {
  if (!isR2Configured()) {
    throw new Error('B2 storage is not configured');
  }

  // Extract key from full URL if needed
  let key = fileKey;
  if (fileKey.startsWith('http')) {
    const url = new URL(fileKey);
    // B2 friendly URL format: /file/bucket-name/key
    // We need to extract just the key part
    const pathname = url.pathname;
    const match = pathname.match(/^\/file\/[^/]+\/(.+)$/);
    if (match) {
      key = match[1]; // Extract key after /file/bucket-name/
    } else {
      key = pathname.replace(/^\//, ''); // Fallback: just remove leading slash
    }
  }

  const command = new DeleteObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Get the public URL for a file
 * @param {string} fileKey - The file key in B2
 * @returns {string} The public URL
 */
export const getPublicUrl = (fileKey) => {
  if (!fileKey) return null;

  // If it's already a full URL, return as-is
  if (fileKey.startsWith('http')) {
    return fileKey;
  }

  // Return public URL
  if (B2_PUBLIC_URL) {
    return `${B2_PUBLIC_URL}/${fileKey}`;
  }

  // Fallback to direct B2 URL
  return `https://${B2_ENDPOINT}/file/${B2_BUCKET}/${fileKey}`;
};

/**
 * Upload multiple files to Backblaze B2
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files - Array of file objects
 * @returns {Promise<Array<{key: string, url: string}>>}
 */
export const uploadMultipleToR2 = async (files) => {
  if (!isR2Configured()) {
    throw new Error('B2 storage is not configured');
  }

  const uploadPromises = files.map(file =>
    uploadToR2(file.buffer, file.originalname, file.mimetype)
  );

  return Promise.all(uploadPromises);
};

export default {
  isR2Configured,
  uploadToR2,
  uploadMultipleToR2,
  deleteFromR2,
  getPublicUrl,
  thumbnailKeyFor,
  generateAndUploadThumbnail,
  thumbnailExists,
  keyFromPublicUrl,
};

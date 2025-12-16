import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import crypto from 'crypto';

// B2 Configuration
const B2_ENDPOINT = process.env.B2_ENDPOINT; // e.g., s3.us-west-004.backblazeb2.com
const B2_BUCKET = process.env.B2_BUCKET_NAME;
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;
const CDN_URL = process.env.CDN_URL; // Your Cloudflare CDN URL e.g., https://images.yourdomain.com

// Initialize S3 client for B2
const s3Client = B2_ENDPOINT ? new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: 'us-west-004', // B2 region from endpoint
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
}) : null;

/**
 * Check if B2 storage is configured
 */
export const isB2Configured = () => {
  return !!(B2_ENDPOINT && B2_BUCKET && B2_KEY_ID && B2_APP_KEY);
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
export const uploadToB2 = async (fileBuffer, originalFilename, mimeType) => {
  if (!isB2Configured()) {
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

  // Return the CDN URL if configured, otherwise direct B2 URL
  const url = CDN_URL
    ? `${CDN_URL}/${fileKey}`
    : `https://${B2_BUCKET}.${B2_ENDPOINT}/${fileKey}`;

  return {
    key: fileKey,
    url: url,
  };
};

/**
 * Delete a file from Backblaze B2
 * @param {string} fileKey - The file key in B2
 */
export const deleteFromB2 = async (fileKey) => {
  if (!isB2Configured()) {
    throw new Error('B2 storage is not configured');
  }

  // Extract key from full URL if needed
  let key = fileKey;
  if (fileKey.startsWith('http')) {
    const url = new URL(fileKey);
    key = url.pathname.replace(/^\//, ''); // Remove leading slash
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

  // Return CDN URL if configured
  if (CDN_URL) {
    return `${CDN_URL}/${fileKey}`;
  }

  // Fallback to direct B2 URL
  return `https://${B2_BUCKET}.${B2_ENDPOINT}/${fileKey}`;
};

/**
 * Upload multiple files to Backblaze B2
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files - Array of file objects
 * @returns {Promise<Array<{key: string, url: string}>>}
 */
export const uploadMultipleToB2 = async (files) => {
  if (!isB2Configured()) {
    throw new Error('B2 storage is not configured');
  }

  const uploadPromises = files.map(file =>
    uploadToB2(file.buffer, file.originalname, file.mimetype)
  );

  return Promise.all(uploadPromises);
};

export default {
  isB2Configured,
  uploadToB2,
  uploadMultipleToB2,
  deleteFromB2,
  getPublicUrl,
};

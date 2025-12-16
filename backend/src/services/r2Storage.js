import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import crypto from 'crypto';

// Cloudflare R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Your R2 public bucket URL or custom domain

// Initialize S3 client for Cloudflare R2
const s3Client = R2_ACCOUNT_ID ? new S3Client({
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto', // R2 uses 'auto' for region
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
}) : null;

/**
 * Check if R2 storage is configured
 */
export const isR2Configured = () => {
  return !!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
};

/**
 * Generate a unique file key for R2 storage
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
 * Upload a file to Cloudflare R2
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} originalFilename - Original filename for extension
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{key: string, url: string}>}
 */
export const uploadToR2 = async (fileBuffer, originalFilename, mimeType) => {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  const fileKey = generateFileKey(originalFilename);

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: fileKey,
    Body: fileBuffer,
    ContentType: mimeType,
    // Cache for 1 year (images rarely change)
    CacheControl: 'public, max-age=31536000',
  });

  await s3Client.send(command);

  // Return the public URL
  const url = R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${fileKey}`
    : `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${fileKey}`;

  return {
    key: fileKey,
    url: url,
  };
};

/**
 * Delete a file from Cloudflare R2
 * @param {string} fileKey - The file key in R2 or full URL
 */
export const deleteFromR2 = async (fileKey) => {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
  }

  // Extract key from full URL if needed
  let key = fileKey;
  if (fileKey.startsWith('http')) {
    const url = new URL(fileKey);
    key = url.pathname.replace(/^\//, ''); // Remove leading slash
  }

  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Get the public URL for a file
 * @param {string} fileKey - The file key in R2
 * @returns {string} The public URL
 */
export const getPublicUrl = (fileKey) => {
  if (!fileKey) return null;

  // If it's already a full URL, return as-is
  if (fileKey.startsWith('http')) {
    return fileKey;
  }

  // Return public URL
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${fileKey}`;
  }

  // Fallback to direct R2 URL
  return `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${fileKey}`;
};

/**
 * Upload multiple files to Cloudflare R2
 * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} files - Array of file objects
 * @returns {Promise<Array<{key: string, url: string}>>}
 */
export const uploadMultipleToR2 = async (files) => {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured');
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
};

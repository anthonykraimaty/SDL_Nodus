import path from 'path';
import sharp from 'sharp';

const HEIC_MIMES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXTS = new Set(['.heic', '.heif', '.hif']);

const JPEG_QUALITY = 88;

export const isHeic = (originalName, mimeType) => {
  const ext = path.extname(originalName || '').toLowerCase();
  return HEIC_EXTS.has(ext) || HEIC_MIMES.has((mimeType || '').toLowerCase());
};

/**
 * If the input is a HEIC/HEIF image, transcode it to a JPEG buffer and rewrite
 * the filename/mimetype. Otherwise return the input unchanged.
 *
 * The browser cannot render HEIC, so storing the original would leave iPhone
 * uploads invisible to every other user. We honor EXIF orientation here so the
 * downstream thumbnail (which reads the same buffer) is upright too.
 */
export const normalizeImage = async (buffer, originalName, mimeType) => {
  if (!isHeic(originalName, mimeType)) {
    return { buffer, originalName, mimeType };
  }

  const jpegBuffer = await sharp(buffer)
    .rotate()
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const base = path.basename(originalName || 'image', path.extname(originalName || ''));
  return {
    buffer: jpegBuffer,
    originalName: `${base}.jpg`,
    mimeType: 'image/jpeg',
  };
};

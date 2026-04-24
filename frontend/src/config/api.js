// API Configuration
// Use environment variable or fallback to localhost for development
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper to get full URL for images
export const getImageUrl = (filePath) => {
  if (!filePath) return '';
  // If filePath already includes http, return as is
  if (filePath.startsWith('http')) return filePath;
  // Otherwise prepend API_URL
  return `${API_URL}/${filePath}`;
};

// Helper to get a small thumbnail URL for an image.
// Thumbnails are generated at upload time and stored next to the original
// on B2 as `<name>-thumb.webp`. Falls back to the original URL if the path
// doesn't look like a thumbnailable image (pdf, missing extension, etc.).
export const getThumbnailUrl = (filePath) => {
  const full = getImageUrl(filePath);
  if (!full) return '';
  const match = full.match(/^(.*?)(\.[a-zA-Z0-9]+)(\?.*)?$/);
  if (!match) return full;
  const ext = match[2].toLowerCase();
  if (ext === '.pdf' || ext === '.webp') {
    // pdf has no thumb; already-webp files keep their own URL if they're thumbs
    if (/-thumb\.webp$/i.test(full)) return full;
    if (ext === '.pdf') return full;
  }
  return `${match[1]}-thumb.webp${match[3] || ''}`;
};

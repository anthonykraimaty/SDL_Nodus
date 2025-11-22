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

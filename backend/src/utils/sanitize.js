/**
 * Input sanitization utilities to prevent XSS and injection attacks
 */

/**
 * Sanitize a string input by escaping HTML entities
 * @param {string} input - The input string to sanitize
 * @returns {string} - Sanitized string
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') {
    return input;
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
};

/**
 * Sanitize an object's string properties
 * @param {Object} obj - Object with string properties to sanitize
 * @param {string[]} fields - Array of field names to sanitize
 * @returns {Object} - Object with sanitized fields
 */
export const sanitizeObject = (obj, fields) => {
  const sanitized = { ...obj };

  for (const field of fields) {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      sanitized[field] = sanitizeInput(sanitized[field]);
    }
  }

  return sanitized;
};

/**
 * Remove potentially dangerous characters from filenames
 * @param {string} filename - The filename to sanitize
 * @returns {string} - Sanitized filename
 */
export const sanitizeFilename = (filename) => {
  if (typeof filename !== 'string') {
    return 'file';
  }

  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .substring(0, 255);
};

export default {
  sanitizeInput,
  sanitizeObject,
  sanitizeFilename,
};

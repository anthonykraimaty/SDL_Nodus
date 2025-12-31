/**
 * Token blacklist for invalidating JWT tokens on logout
 * In production, this should be replaced with Redis or a database
 */

// In-memory store for blacklisted tokens
// Key: token, Value: expiry timestamp
const blacklistedTokens = new Map();

// Clean up expired tokens every hour
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Add a token to the blacklist
 * @param {string} token - The JWT token to blacklist
 * @param {number} expiresAt - Token expiry timestamp (from JWT)
 */
export const blacklistToken = (token, expiresAt) => {
  blacklistedTokens.set(token, expiresAt);
};

/**
 * Check if a token is blacklisted
 * @param {string} token - The JWT token to check
 * @returns {boolean} - True if token is blacklisted
 */
export const isTokenBlacklisted = (token) => {
  return blacklistedTokens.has(token);
};

/**
 * Clean up expired tokens from the blacklist
 */
const cleanupExpiredTokens = () => {
  const now = Math.floor(Date.now() / 1000);
  for (const [token, expiresAt] of blacklistedTokens.entries()) {
    if (expiresAt < now) {
      blacklistedTokens.delete(token);
    }
  }
};

// Start cleanup interval
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL);

export default {
  blacklistToken,
  isTokenBlacklisted,
};

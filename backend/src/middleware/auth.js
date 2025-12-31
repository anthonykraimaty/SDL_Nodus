import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { isTokenBlacklisted } from '../utils/tokenBlacklist.js';

const prisma = new PrismaClient();

// Middleware to verify JWT token
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if token is blacklisted (logged out)
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been invalidated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { troupe: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Attach user and token to request object
    req.user = user;
    req.token = token;
    req.tokenExp = decoded.exp;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Middleware to check user role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      // Don't expose role requirements in production
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Middleware to check if user can modify a picture
export const canModifyPicture = async (req, res, next) => {
  try {
    const pictureId = parseInt(req.params.id);

    const picture = await prisma.picture.findUnique({
      where: { id: pictureId },
    });

    if (!picture) {
      return res.status(404).json({ error: 'Picture not found' });
    }

    // Admins can modify anything
    if (req.user.role === 'ADMIN') {
      req.picture = picture;
      return next();
    }

    // Branche members can modify any picture for classification/approval
    if (req.user.role === 'BRANCHE_ECLAIREURS') {
      req.picture = picture;
      return next();
    }

    // Chef troupe can only modify their own pending/classified pictures
    if (req.user.role === 'CHEF_TROUPE') {
      if (picture.uploadedById !== req.user.id) {
        return res.status(403).json({ error: 'You can only modify your own pictures' });
      }

      if (!['PENDING', 'CLASSIFIED'].includes(picture.status)) {
        return res.status(403).json({ error: 'Cannot modify approved or rejected pictures' });
      }

      req.picture = picture;
      return next();
    }

    return res.status(403).json({ error: 'Insufficient permissions' });
  } catch (error) {
    return res.status(500).json({ error: 'Error checking permissions' });
  }
};

// Optional authentication (for public endpoints that behave differently when authenticated)
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { troupe: true },
      });

      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};

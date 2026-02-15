import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { generalLimiter } from './middleware/rateLimiter.js';

// Import routes
import authRoutes from './routes/auth.js';
import pictureRoutes from './routes/pictures.js';
import categoryRoutes from './routes/categories.js';
import announcementRoutes from './routes/announcements.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/users.js';
import districtRoutes from './routes/districts.js';
import groupRoutes from './routes/groups.js';
import troupeRoutes from './routes/troupes.js';
import patrouilleRoutes from './routes/patrouilles.js';
import schematicRoutes from './routes/schematics.js';
import designGroupRoutes from './routes/designGroups.js';
import sitemapRoutes from './routes/sitemap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Trust proxy (needed for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded cross-origin
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
}));

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check against allowed origins list
    if (allowedOrigins.some(allowed => origin === allowed)) {
      return callback(null, true);
    }

    // In development, allow localhost with any port
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting - apply to all routes
app.use(generalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically with CORS headers
app.use('/uploads', (req, res, next) => {
  // Add CORS headers for static files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Nodus API is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/pictures', pictureRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/districts', districtRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/troupes', troupeRoutes);
app.use('/api/patrouilles', patrouilleRoutes);
app.use('/api/schematics', schematicRoutes);
app.use('/api/design-groups', designGroupRoutes);
app.use('/api', sitemapRoutes); // Sitemap and robots.txt

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Backfill: set Picture.type from PictureSet.type for pictures with null type
  try {
    const result = await prisma.$executeRaw`
      UPDATE "Picture" p
      SET type = ps.type
      FROM "PictureSet" ps
      WHERE p."pictureSetId" = ps.id
      AND p.type IS NULL
    `;
    if (result > 0) {
      console.log(`Backfilled Picture.type for ${result} pictures`);
    }
  } catch (err) {
    console.error('Picture type backfill error:', err.message);
  }
});

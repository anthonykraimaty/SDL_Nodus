import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToR2, isR2Configured } from '../services/r2Storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use memory storage when R2 is configured, disk storage for local
const getStorage = () => {
  if (isR2Configured()) {
    // Memory storage for R2 upload
    return multer.memoryStorage();
  }

  // Local disk storage (fallback/development)
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      const uploadPath = path.join(__dirname, '../../uploads/pictures', String(year), month);

      // Create directory if it doesn't exist
      import('fs').then(fs => {
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
      });
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
};

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Multer configuration
export const upload = multer({
  storage: getStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: fileFilter,
});

/**
 * Middleware to handle R2 upload after multer processes the file
 * This uploads to R2 if configured, otherwise uses local path
 */
export const processUpload = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    if (isR2Configured()) {
      // Upload to R2
      const result = await uploadToR2(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // Replace file info with R2 details
      req.file.r2Key = result.key;
      req.file.r2Url = result.url;
      req.file.filePath = result.url; // For compatibility
      req.file.storageType = 'r2';
    } else {
      // Local storage - construct the path
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      req.file.filePath = `/uploads/pictures/${year}/${month}/${req.file.filename}`;
      req.file.storageType = 'local';
    }

    next();
  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({ error: 'Failed to process upload: ' + error.message });
  }
};

// Error handler for multer errors
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

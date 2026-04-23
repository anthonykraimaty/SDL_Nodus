import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getAllSettings, setSetting, FEATURE_FLAGS } from '../utils/settings.js';

const router = express.Router();

// GET /api/settings - Public read of feature flags (used by frontend to gate UI)
router.get('/', async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json(settings);
  } catch (err) {
    console.error('Failed to load settings:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings - Update one or more settings (ADMIN only)
// Body: { key: value, key2: value2, ... }
router.put('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const updates = req.body || {};
    const applied = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!(key in FEATURE_FLAGS)) continue;
      await setSetting(key, value, req.user.id);
      applied[key] = value;
    }

    const settings = await getAllSettings();
    res.json({ settings, applied });
  } catch (err) {
    console.error('Failed to update settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

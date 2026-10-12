import express from 'express';
import { getSchemes, createScheme, updateScheme, deleteScheme } from '../controllers/schemeController.js';
import { getUnifiedSchemes } from '../services/unifiedSchemes.js';
import { refreshExternalFeeds } from '../services/externalFeeds.js';
import { requireAdmin, requireCsrf } from '../middleware/adminAuth.js';

const router = express.Router();

router.get('/', getSchemes);
router.post('/', requireAdmin, requireCsrf, createScheme);
router.put('/:id', requireAdmin, requireCsrf, updateScheme);
router.delete('/:id', requireAdmin, requireCsrf, deleteScheme);

// ✅ Unified view: local + external feeds
router.get('/unified', async (req, res) => {
  try {
    const unified = await getUnifiedSchemes();
    res.json(unified);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load unified schemes' });
  }
});

// ✅ Feed health/status check
router.get('/feeds/status', async (req, res) => {
  try {
    const feeds = await refreshExternalFeeds();
    const status = Object.values(feeds.feeds).map(f => ({
      key: f.key,
      name: f.name,
      status: f.status,
      error: f.error ?? null,
    }));
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load feed status' });
  }
});

export default router;

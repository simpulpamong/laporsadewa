import { Router } from 'express';
import { loadDynamicConfig } from '../lib-shared/server/dynamicConfig.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const cfg = await loadDynamicConfig({ force });
    res.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.json({ success: true, ...cfg, fallback: cfg.categories.length === 0 });
  } catch (error: unknown) {
    console.error('[api/config] failed to load report categories:', error);
    res.set('Cache-Control', 'no-store');
    const message = error instanceof Error ? error.message : 'Gagal memuat kategori laporan dari Firestore.';
    res.status(message.includes('belum dikonfigurasi') ? 503 : 500).json({
      success: false,
      categories: [],
      subcategories: [],
      fallback: false,
      message,
    });
  }
});

export default router;

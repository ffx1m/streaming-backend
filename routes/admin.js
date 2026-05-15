import express from 'express';
import authRoutes from './admin/auth.js';
import dashboardRoutes from './admin/dashboard.js';
import episodeRoutes from './admin/episodes.js';
import securityRoutes from './admin/security.js';
import seriesRoutes from './admin/series.js';

const router = express.Router();

router.use(authRoutes);
router.use('/security', securityRoutes);
router.use(dashboardRoutes);
router.use(seriesRoutes);
router.use(episodeRoutes);

export default router;

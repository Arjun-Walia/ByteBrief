import { Router } from 'express';
import v1Routes from './v1';
import adminRoutes from './admin';
import healthRoutes from './health';
// Legacy routes (deprecated, use /api/v1 instead)
import articleRoutes from './articles';
import categoryRoutes from './categories';
import userRoutes from './users';
import notificationRoutes from './notifications';

const router = Router();

// API v1 routes (recommended)
router.use('/v1', v1Routes);

// Admin routes for pipeline management
router.use('/admin/pipeline', adminRoutes);

// Health check routes
router.use('/health', healthRoutes);

// Legacy routes (deprecated, maintained for backward compatibility)
// These routes are deprecated and will be removed in a future version
router.use('/articles', articleRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);

// API info
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'ByteBrief API',
      version: '1.0.0',
      description: 'Minimalist tech news aggregator backend',
      docs: '/api/docs',
      endpoints: {
        v1: '/api/v1',
        health: '/api/health',
        healthDetailed: '/api/health/detailed',
        metrics: '/api/health/metrics',
      },
    },
  });
});

export default router;

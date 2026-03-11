import { Router } from 'express';
import v1Routes from './v1';
// Legacy routes (deprecated, use /api/v1 instead)
import articleRoutes from './articles';
import categoryRoutes from './categories';
import userRoutes from './users';
import notificationRoutes from './notifications';

const router = Router();

// API v1 routes (recommended)
router.use('/v1', v1Routes);

// Legacy routes (deprecated, maintained for backward compatibility)
// These routes are deprecated and will be removed in a future version
router.use('/articles', articleRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      version: 'v1',
      timestamp: new Date().toISOString(),
    },
  });
});

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
      },
    },
  });
});

export default router;

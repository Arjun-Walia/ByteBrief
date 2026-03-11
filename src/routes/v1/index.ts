import { Router } from 'express';
import newsRoutes from './news';
import deviceRoutes from './device';
import bookmarkRoutes from './bookmarks';

// Import existing routes
import articleRoutes from '../articles';
import categoryRoutes from '../categories';
import userRoutes from '../users';
import notificationRoutes from '../notifications';

const router = Router();

// New v1 routes
router.use('/news', newsRoutes);
router.use('/device', deviceRoutes);
router.use('/bookmarks', bookmarkRoutes);

// Existing routes (migrated to v1)
router.use('/articles', articleRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);

export default router;

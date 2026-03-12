import { Router } from 'express';
import newsRoutes from './news';
import deviceRoutes from './device';
import bookmarkRoutes from './bookmarks';
import notificationAdminRoutes from './notifications';

// Import existing routes
import articleRoutes from '../articles';
import categoryRoutes from '../categories';
import userRoutes from '../users';

const router = Router();

// New v1 routes
router.use('/news', newsRoutes);
router.use('/device', deviceRoutes);
router.use('/bookmarks', bookmarkRoutes);
router.use('/notifications', notificationAdminRoutes);

// Existing routes (migrated to v1)
router.use('/articles', articleRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);

export default router;

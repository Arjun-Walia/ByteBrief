import { Router } from 'express';
import { registerDevice, unregisterDevice } from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/notifications/register - Register device token (protected)
router.post('/register', authenticate, registerDevice);

// DELETE /api/notifications/unregister - Unregister device token (protected)
router.delete('/unregister', authenticate, unregisterDevice);

export default router;

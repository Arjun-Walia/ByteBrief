import { Router } from 'express';
import deviceController from '../../controllers/deviceController';
import { authenticate } from '../../middleware/auth';
import { validate, registerDeviceSchema, unregisterDeviceSchema } from '../../validation';

const router = Router();

/**
 * All device routes require authentication
 */
router.use(authenticate);

/**
 * @route   POST /api/v1/device/register
 * @desc    Register device token for push notifications
 * @access  Private
 */
router.post('/register', validate(registerDeviceSchema), deviceController.registerDevice);

/**
 * @route   DELETE /api/v1/device/unregister
 * @desc    Unregister device token
 * @access  Private
 */
router.delete('/unregister', validate(unregisterDeviceSchema), deviceController.unregisterDevice);

/**
 * @route   POST /api/v1/device/unregister-all
 * @desc    Unregister all devices for current user
 * @access  Private
 */
router.post('/unregister-all', deviceController.unregisterAllDevices);

export default router;

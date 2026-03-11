import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { userRepository } from '../repositories';

/**
 * POST /api/v1/device/register
 * Register a device token for push notifications
 */
export async function registerDevice(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const { token, platform } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Device token is required',
      });
    }

    // Remove token from any other user that might have it
    await userRepository.removeDeviceTokenFromAll(token);

    // Add token to current user
    await userRepository.addDeviceToken(userId, token);

    res.json({
      success: true,
      message: 'Device registered successfully',
      data: {
        platform: platform || 'unknown',
        registered: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/device/unregister
 * Unregister a device token
 */
export async function unregisterDevice(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const { token } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Device token is required',
      });
    }

    await userRepository.removeDeviceToken(userId, token);

    res.json({
      success: true,
      message: 'Device unregistered successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/device/unregister-all
 * Unregister all devices for current user
 */
export async function unregisterAllDevices(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    await userRepository.updateById(userId, { $set: { deviceTokens: [] } });

    res.json({
      success: true,
      message: 'All devices unregistered successfully',
    });
  } catch (error) {
    next(error);
  }
}

export default {
  registerDevice,
  unregisterDevice,
  unregisterAllDevices,
};

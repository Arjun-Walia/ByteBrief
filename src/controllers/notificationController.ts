import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import {
  ApiResponse,
  AuthenticatedRequest,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../types';

export const registerDevice = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<{ message: string }>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { token } = req.body;
    if (!token) {
      throw new ValidationError('Device token is required');
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Add token if not already present
    if (!user.deviceTokens.includes(token)) {
      user.deviceTokens.push(token);
      await user.save();
    }

    res.json({ success: true, data: { message: 'Device registered' } });
  } catch (error) {
    next(error);
  }
};

export const unregisterDevice = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<{ message: string }>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { token } = req.body;
    if (!token) {
      throw new ValidationError('Device token is required');
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Remove token
    const index = user.deviceTokens.indexOf(token);
    if (index > -1) {
      user.deviceTokens.splice(index, 1);
      await user.save();
    }

    res.json({ success: true, data: { message: 'Device unregistered' } });
  } catch (error) {
    next(error);
  }
};

export default {
  registerDevice,
  unregisterDevice,
};

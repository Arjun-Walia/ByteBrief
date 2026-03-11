import { User, IUser } from '../models/User';
import { UpdateQuery } from 'mongoose';

export interface UserFilters {
  email?: string;
  isActive?: boolean;
  notificationsEnabled?: boolean;
}

/**
 * Repository for User database operations
 */
export class UserRepository {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }

  /**
   * Find user by ID with password (for auth)
   */
  async findByIdWithPassword(id: string): Promise<IUser | null> {
    return User.findById(id).select('+password');
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  /**
   * Find user by email with password (for auth)
   */
  async findByEmailWithPassword(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() }).select('+password');
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const count = await User.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  }

  /**
   * Create new user
   */
  async create(userData: Partial<IUser>): Promise<IUser> {
    const user = new User({
      ...userData,
      email: userData.email?.toLowerCase(),
    });
    return user.save();
  }

  /**
   * Update user by ID
   */
  async updateById(
    id: string,
    update: UpdateQuery<IUser>
  ): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, update, { new: true });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    id: string,
    preferences: Partial<IUser['preferences']>
  ): Promise<IUser | null> {
    const updateFields: Record<string, unknown> = {};
    
    Object.entries(preferences).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields[`preferences.${key}`] = value;
      }
    });

    return User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await User.updateOne({ _id: id }, { lastLoginAt: new Date() });
  }

  /**
   * Add device token for push notifications
   */
  async addDeviceToken(id: string, token: string): Promise<void> {
    await User.updateOne(
      { _id: id },
      { $addToSet: { deviceTokens: token } }
    );
  }

  /**
   * Remove device token
   */
  async removeDeviceToken(id: string, token: string): Promise<void> {
    await User.updateOne(
      { _id: id },
      { $pull: { deviceTokens: token } }
    );
  }

  /**
   * Remove device token from all users (for token cleanup)
   */
  async removeDeviceTokenFromAll(token: string): Promise<void> {
    await User.updateMany(
      { deviceTokens: token },
      { $pull: { deviceTokens: token } }
    );
  }

  /**
   * Find users with notifications enabled
   */
  async findWithNotificationsEnabled(): Promise<IUser[]> {
    return User.find({
      'preferences.notificationsEnabled': true,
      deviceTokens: { $exists: true, $not: { $size: 0 } },
      isActive: true,
    });
  }

  /**
   * Find users by device tokens
   */
  async findByDeviceToken(token: string): Promise<IUser[]> {
    return User.find({ deviceTokens: token });
  }

  /**
   * Get all device tokens for notifications
   */
  async getAllDeviceTokens(): Promise<string[]> {
    const users = await User.find({
      'preferences.notificationsEnabled': true,
      deviceTokens: { $exists: true, $not: { $size: 0 } },
      isActive: true,
    }).select('deviceTokens');

    const allTokens = users.flatMap(user => user.deviceTokens);
    return [...new Set(allTokens)];
  }

  /**
   * Deactivate user
   */
  async deactivate(id: string): Promise<void> {
    await User.updateOne({ _id: id }, { isActive: false });
  }

  /**
   * Delete user by ID
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await User.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  /**
   * Count total users
   */
  async countTotal(): Promise<number> {
    return User.countDocuments({ isActive: true });
  }

  /**
   * Add to read history
   */
  async addToReadHistory(userId: string, articleId: string): Promise<void> {
    // Remove if already exists to prevent duplicates
    await User.updateOne(
      { _id: userId },
      { $pull: { readHistory: { article: articleId } } }
    );

    // Add to beginning of history (most recent first)
    await User.updateOne(
      { _id: userId },
      {
        $push: {
          readHistory: {
            $each: [{ article: articleId, readAt: new Date() }],
            $position: 0,
            $slice: 100, // Keep only last 100 items
          },
        },
      }
    );
  }

  /**
   * Get read history for user
   */
  async getReadHistory(userId: string, limit: number = 50): Promise<IUser | null> {
    return User.findById(userId)
      .select('readHistory')
      .populate({
        path: 'readHistory.article',
        populate: { path: 'category', select: 'name slug' },
      })
      .slice('readHistory', limit);
  }
}

// Singleton instance
export const userRepository = new UserRepository();

export default userRepository;

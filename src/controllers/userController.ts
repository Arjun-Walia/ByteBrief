import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, Article } from '../models';
import { cacheService, CacheService } from '../services/cache/cacheService';
import { env } from '../config/env';
import {
  ApiResponse,
  UserDTO,
  ArticleDTO,
  AuthenticatedRequest,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  JWTPayload,
} from '../types';

const toUserDTO = (user: InstanceType<typeof User>): UserDTO => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
  preferences: user.preferences,
  createdAt: user.createdAt.toISOString(),
});

const generateToken = (userId: string, email: string): string => {
  const payload: JWTPayload = { userId, email };
  return jwt.sign(payload, env.JWT_SECRET, { 
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  });
};

export const register = async (
  req: Request,
  res: Response<ApiResponse<{ user: UserDTO; token: string }>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    const user = await User.create({
      email,
      password,
      displayName,
      preferences: {
        categories: [],
        notificationsEnabled: true,
        notificationTime: '08:00',
        darkMode: true,
      },
    });

    const token = generateToken(user._id.toString(), user.email);

    res.status(201).json({
      success: true,
      data: {
        user: toUserDTO(user),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response<ApiResponse<{ user: UserDTO; token: string }>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user._id.toString(), user.email);

    res.json({
      success: true,
      data: {
        user: toUserDTO(user),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<UserDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    res.json({ success: true, data: toUserDTO(user) });
  } catch (error) {
    next(error);
  }
};

export const updatePreferences = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<UserDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { categories, notificationsEnabled, notificationTime, darkMode } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (categories !== undefined) user.preferences.categories = categories;
    if (notificationsEnabled !== undefined) user.preferences.notificationsEnabled = notificationsEnabled;
    if (notificationTime !== undefined) user.preferences.notificationTime = notificationTime;
    if (darkMode !== undefined) user.preferences.darkMode = darkMode;

    await user.save();

    res.json({ success: true, data: toUserDTO(user) });
  } catch (error) {
    next(error);
  }
};

export const getBookmarks = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<ArticleDTO[]>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const user = await User.findById(req.userId).populate({
      path: 'bookmarks',
      populate: { path: 'category', select: 'name slug' },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const articles = user.bookmarks as unknown as Array<InstanceType<typeof Article>>;
    const data: ArticleDTO[] = articles.map(article => ({
      id: article._id.toString(),
      title: article.title,
      summary: article.summary,
      sourceUrl: article.sourceUrl,
      sourceName: article.sourceName,
      imageUrl: article.imageUrl,
      category: (article.category as unknown as { name: string })?.name || '',
      categorySlug: article.categorySlug,
      tags: article.tags,
      author: article.author,
      publishedAt: article.publishedAt.toISOString(),
      score: article.score,
      readTime: article.readTime,
      isFeatured: article.isFeatured,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const addBookmark = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<{ message: string }>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { articleId } = req.params;

    const article = await Article.findById(articleId);
    if (!article) {
      throw new NotFoundError('Article');
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (!user.bookmarks.includes(article._id)) {
      user.bookmarks.push(article._id);
      await user.save();

      // Update article bookmark count
      await Article.updateOne({ _id: articleId }, { $inc: { bookmarkCount: 1 } });

      // Clear cache
      await cacheService.delete(CacheService.keys.userBookmarks(req.userId));
    }

    res.json({ success: true, data: { message: 'Bookmark added' } });
  } catch (error) {
    next(error);
  }
};

export const removeBookmark = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<{ message: string }>>,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { articleId } = req.params;

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const index = user.bookmarks.findIndex(id => id.toString() === articleId);
    if (index > -1) {
      user.bookmarks.splice(index, 1);
      await user.save();

      // Update article bookmark count
      await Article.updateOne({ _id: articleId }, { $inc: { bookmarkCount: -1 } });

      // Clear cache
      await cacheService.delete(CacheService.keys.userBookmarks(req.userId));
    }

    res.json({ success: true, data: { message: 'Bookmark removed' } });
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  getProfile,
  updatePreferences,
  getBookmarks,
  addBookmark,
  removeBookmark,
};

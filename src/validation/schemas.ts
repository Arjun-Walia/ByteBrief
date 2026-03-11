import { z } from 'zod';

// ============================================
// Common Schemas
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

// ============================================
// Auth Schemas
// ============================================

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
  }),
});

// ============================================
// User Schemas
// ============================================

export const updatePreferencesSchema = z.object({
  body: z.object({
    notificationsEnabled: z.boolean().optional(),
    dailyDigestTime: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)')
      .optional(),
    preferredCategories: z.array(objectIdSchema).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    avatar: z.string().url().optional(),
  }),
});

// ============================================
// Device Schemas
// ============================================

export const registerDeviceSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Device token is required'),
    platform: z.enum(['ios', 'android', 'web']).optional(),
  }),
});

export const unregisterDeviceSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Device token is required'),
  }),
});

// ============================================
// Article Schemas
// ============================================

export const getArticlesSchema = z.object({
  query: paginationSchema.extend({
    category: z.string().optional(),
    search: z.string().max(200).optional(),
    source: z.string().optional(),
    sortBy: z.enum(['publishedAt', 'relevanceScore', 'createdAt']).default('publishedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const getArticleByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const getTodayArticlesSchema = z.object({
  query: paginationSchema.extend({
    category: z.string().optional(),
  }),
});

export const getArticlesByCategorySchema = z.object({
  params: z.object({
    category: z.string().min(1, 'Category is required'),
  }),
  query: paginationSchema,
});

export const searchArticlesSchema = z.object({
  query: paginationSchema.extend({
    q: z.string().min(1, 'Search query is required').max(200),
  }),
});

// ============================================
// Bookmark Schemas
// ============================================

export const createBookmarkSchema = z.object({
  body: z.object({
    articleId: objectIdSchema,
    folder: z.string().max(50).optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const updateBookmarkSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    folder: z.string().max(50).optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const deleteBookmarkSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const getBookmarksSchema = z.object({
  query: paginationSchema.extend({
    folder: z.string().optional(),
  }),
});

export const toggleBookmarkSchema = z.object({
  body: z.object({
    articleId: objectIdSchema,
    folder: z.string().max(50).optional(),
  }),
});

// ============================================
// Category Schemas
// ============================================

export const getCategorySchema = z.object({
  params: z.object({
    slug: z.string().min(1, 'Category slug is required'),
  }),
});

// ============================================
// Notification Schemas
// ============================================

export const getNotificationsSchema = z.object({
  query: paginationSchema.extend({
    unreadOnly: z.coerce.boolean().default(false),
  }),
});

export const markNotificationReadSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

// ============================================
// Type Exports
// ============================================

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>['body'];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>['body'];
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>['body'];
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>['body'];
export type ToggleBookmarkInput = z.infer<typeof toggleBookmarkSchema>['body'];
export type GetArticlesQuery = z.infer<typeof getArticlesSchema>['query'];
export type GetBookmarksQuery = z.infer<typeof getBookmarksSchema>['query'];

export interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  sourceUrl: string;
  sourceName: string;
  imageUrl?: string;
  category: string;
  categorySlug: string;
  tags: string[];
  author?: string;
  publishedAt: string;
  score: number;
  readTime: number;
  isFeatured: boolean;
  viewCount?: number;
  bookmarkCount?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  color: string;
  articleCount: number;
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  preferences: UserPreferences;
  createdAt: string;
}

export interface UserPreferences {
  categories: string[];
  notificationsEnabled: boolean;
  notificationTime: string;
  darkMode: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

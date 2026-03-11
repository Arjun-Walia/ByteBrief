import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

// Express extended types
export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
  };
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
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

// API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Article DTOs
export interface ArticleDTO {
  id: string;
  title: string;
  summary: string;
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
}

export interface ArticleDetailDTO extends ArticleDTO {
  content: string;
  viewCount: number;
  bookmarkCount: number;
}

// User DTOs
export interface UserDTO {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  preferences: {
    categories: string[];
    notificationsEnabled: boolean;
    notificationTime: string;
    darkMode: boolean;
  };
  createdAt: string;
}

// Category DTOs
export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  color: string;
  articleCount: number;
}

// Auth types
export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// Error types
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

// Controller type helper
export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

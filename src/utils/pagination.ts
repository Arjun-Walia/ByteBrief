/**
 * Advanced Pagination Utilities
 * Supports both offset-based and cursor-based pagination for optimal performance
 */

import { Request } from 'express';
import { Types } from 'mongoose';

export interface PaginationOptions {
  /** Default page size */
  defaultLimit?: number;
  /** Maximum page size */
  maxLimit?: number;
  /** Default sort field */
  defaultSort?: string;
  /** Default sort direction */
  defaultOrder?: 'asc' | 'desc';
}

export interface OffsetPaginationParams {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
}

export interface CursorPaginationParams {
  limit: number;
  cursor: ParsedCursor | null;
  sort: Record<string, 1 | -1>;
}

export interface ParsedCursor {
  id: string;
  value: string | number | Date;
  field: string;
  direction: 'asc' | 'desc';
}

export interface OffsetPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
}

export interface CursorPaginationMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}

const DEFAULT_OPTIONS: PaginationOptions = {
  defaultLimit: 20,
  maxLimit: 100,
  defaultSort: 'publishedAt',
  defaultOrder: 'desc',
};

/**
 * Parse offset-based pagination from request
 */
export function parseOffsetPagination(
  req: Request,
  options: PaginationOptions = {}
): OffsetPaginationParams {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(
    opts.maxLimit!,
    Math.max(1, parseInt(req.query.limit as string, 10) || opts.defaultLimit!)
  );
  const skip = (page - 1) * limit;

  // Parse sort
  const sortField = (req.query.sort as string) || opts.defaultSort!;
  const sortOrder = req.query.order === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

  // Add secondary sort by _id for stable ordering
  if (sortField !== '_id') {
    sort._id = sortOrder;
  }

  return { page, limit, skip, sort };
}

/**
 * Parse cursor-based pagination from request
 * More efficient for large datasets - avoids COUNT queries
 */
export function parseCursorPagination(
  req: Request,
  options: PaginationOptions = {}
): CursorPaginationParams {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const limit = Math.min(
    opts.maxLimit!,
    Math.max(1, parseInt(req.query.limit as string, 10) || opts.defaultLimit!)
  );

  // Parse cursor
  let cursor: ParsedCursor | null = null;
  if (req.query.cursor) {
    try {
      const decoded = Buffer.from(req.query.cursor as string, 'base64').toString('utf-8');
      cursor = JSON.parse(decoded) as ParsedCursor;
    } catch {
      cursor = null;
    }
  }

  // Parse sort
  const sortField = (req.query.sort as string) || opts.defaultSort!;
  const sortOrder = req.query.order === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

  if (sortField !== '_id') {
    sort._id = sortOrder;
  }

  return { limit, cursor, sort };
}

/**
 * Build MongoDB query filter for cursor pagination
 */
export function buildCursorQuery(
  cursor: ParsedCursor | null,
  baseFilter: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!cursor) {
    return baseFilter;
  }

  const { id, value, field, direction } = cursor;
  const operator = direction === 'desc' ? '$lt' : '$gt';

  // Compound cursor query for stable ordering
  return {
    ...baseFilter,
    $or: [
      { [field]: { [operator]: value } },
      {
        [field]: value,
        _id: { [operator]: new Types.ObjectId(id) },
      },
    ],
  };
}

/**
 * Encode cursor from last item
 */
export function encodeCursor(
  item: { _id: Types.ObjectId | string; [key: string]: unknown },
  field: string,
  direction: 'asc' | 'desc'
): string {
  const cursor: ParsedCursor = {
    id: item._id.toString(),
    value: item[field] as string | number | Date,
    field,
    direction,
  };

  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Build offset pagination metadata
 */
export function buildOffsetMeta(
  page: number,
  limit: number,
  total: number
): OffsetPaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Build cursor pagination metadata
 */
export function buildCursorMeta<T extends { _id: Types.ObjectId | string; [key: string]: unknown }>(
  items: T[],
  limit: number,
  sortField: string,
  sortDirection: 'asc' | 'desc',
  cursor: ParsedCursor | null
): CursorPaginationMeta {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (hasMore && pageItems.length > 0) {
    const lastItem = pageItems[pageItems.length - 1];
    nextCursor = encodeCursor(lastItem, sortField, sortDirection);
  }

  if (cursor && pageItems.length > 0) {
    // For previous cursor, we use the first item
    const firstItem = pageItems[0];
    const reverseDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    prevCursor = encodeCursor(firstItem, sortField, reverseDirection);
  }

  return {
    limit,
    hasMore,
    nextCursor,
    prevCursor,
  };
}

/**
 * Type guard for items with required pagination fields
 */
export function hasPaginationFields<T>(
  item: T,
  field: string
): item is T & { _id: Types.ObjectId | string; [key: string]: unknown } {
  return (
    item !== null &&
    typeof item === 'object' &&
    '_id' in item &&
    field in item
  );
}

/**
 * Pagination response builder
 */
export class PaginationBuilder<T> {
  private items: T[] = [];
  private meta: OffsetPaginationMeta | CursorPaginationMeta | null = null;

  setItems(items: T[]): this {
    this.items = items;
    return this;
  }

  setOffsetMeta(page: number, limit: number, total: number): this {
    this.meta = buildOffsetMeta(page, limit, total);
    return this;
  }

  setCursorMeta(
    items: Array<{ _id: Types.ObjectId | string; [key: string]: unknown }>,
    limit: number,
    sortField: string,
    sortDirection: 'asc' | 'desc',
    cursor: ParsedCursor | null
  ): this {
    this.meta = buildCursorMeta(items, limit, sortField, sortDirection, cursor);
    return this;
  }

  build(): { data: T[]; pagination: OffsetPaginationMeta | CursorPaginationMeta } {
    return {
      data: this.items,
      pagination: this.meta!,
    };
  }
}

export default {
  parseOffsetPagination,
  parseCursorPagination,
  buildCursorQuery,
  encodeCursor,
  buildOffsetMeta,
  buildCursorMeta,
  PaginationBuilder,
};

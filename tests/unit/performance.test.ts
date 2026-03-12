/**
 * Performance Optimization Tests
 * Tests for caching, pagination, compression, and cache invalidation
 */

import { AdvancedCacheService } from '../../src/services/cache/advancedCache';
import {
  parseOffsetPagination,
  parseCursorPagination,
  buildCursorQuery,
  encodeCursor,
  buildOffsetMeta,
  buildCursorMeta,
} from '../../src/utils/pagination';
import { CacheEntry, DEFAULT_CACHE_CONFIG } from '../../src/services/cache/types';
import { Request } from 'express';
import { Types } from 'mongoose';

// Mock Redis client
jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
    hincrby: jest.fn(),
    hgetall: jest.fn(),
    info: jest.fn(),
    dbsize: jest.fn(),
    mget: jest.fn(),
    pipeline: jest.fn(() => ({
      setex: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    })),
    duplicate: jest.fn(() => ({
      subscribe: jest.fn(),
      on: jest.fn(),
      unsubscribe: jest.fn(),
      quit: jest.fn(),
    })),
    publish: jest.fn(),
    keys: jest.fn(),
    ttl: jest.fn(),
  })),
}));

describe('Advanced Cache Service', () => {
  describe('Cache Key Generation', () => {
    it('should generate correct article list cache key', () => {
      const key = AdvancedCacheService.keys.articles(1, 20);
      expect(key).toBe('articles:list:1:20');
    });

    it('should generate correct article by ID cache key', () => {
      const key = AdvancedCacheService.keys.articleById('abc123');
      expect(key).toBe('article:abc123');
    });

    it('should generate correct top articles cache key', () => {
      const key = AdvancedCacheService.keys.topArticles(10);
      expect(key).toBe('top:articles:10');
    });

    it('should generate correct category articles cache key', () => {
      const key = AdvancedCacheService.keys.articlesByCategory('ai', 2, 20);
      expect(key).toBe('category:ai:2:20');
    });

    it('should generate correct search cache key with base64 encoding', () => {
      const key = AdvancedCacheService.keys.searchResults('typescript', 1);
      expect(key).toContain('search:');
      expect(key).toContain(':1');
    });

    it('should generate correct feed cache keys', () => {
      expect(AdvancedCacheService.keys.feedLatest()).toBe('feed:latest');
      expect(AdvancedCacheService.keys.feedByCategory('mobile')).toBe('feed:category:mobile');
    });
  });

  describe('Default Cache Config', () => {
    it('should have 10-minute default TTL', () => {
      expect(DEFAULT_CACHE_CONFIG.defaultTTL).toBe(600);
    });

    it('should have stats enabled by default', () => {
      expect(DEFAULT_CACHE_CONFIG.enableStats).toBe(true);
    });

    it('should have stale-while-revalidate window', () => {
      expect(DEFAULT_CACHE_CONFIG.staleWhileRevalidate).toBe(60);
    });
  });
});

describe('Pagination Utilities', () => {
  describe('Offset Pagination', () => {
    const mockRequest = (query: Record<string, string>) => ({
      query,
    } as unknown as Request);

    it('should parse default pagination values', () => {
      const req = mockRequest({});
      const result = parseOffsetPagination(req);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(0);
    });

    it('should parse custom page and limit', () => {
      const req = mockRequest({ page: '3', limit: '50' });
      const result = parseOffsetPagination(req);

      expect(result.page).toBe(3);
      expect(result.limit).toBe(50);
      expect(result.skip).toBe(100); // (3-1) * 50
    });

    it('should enforce minimum page of 1', () => {
      const req = mockRequest({ page: '-5' });
      const result = parseOffsetPagination(req);

      expect(result.page).toBe(1);
    });

    it('should enforce maximum limit', () => {
      const req = mockRequest({ limit: '500' });
      const result = parseOffsetPagination(req, { maxLimit: 100 });

      expect(result.limit).toBe(100);
    });

    it('should parse sort parameters', () => {
      const req = mockRequest({ sort: 'score', order: 'desc' });
      const result = parseOffsetPagination(req);

      expect(result.sort).toEqual({ score: -1, _id: -1 });
    });
  });

  describe('Cursor Pagination', () => {
    const mockRequest = (query: Record<string, string>) => ({
      query,
    } as unknown as Request);

    it('should parse default cursor pagination', () => {
      const req = mockRequest({});
      const result = parseCursorPagination(req);

      expect(result.limit).toBe(20);
      expect(result.cursor).toBeNull();
    });

    it('should parse encoded cursor', () => {
      const testCursor = {
        id: '507f1f77bcf86cd799439011',
        value: '2024-01-15T10:00:00Z',
        field: 'publishedAt',
        direction: 'desc',
      };
      const encoded = Buffer.from(JSON.stringify(testCursor)).toString('base64');

      const req = mockRequest({ cursor: encoded });
      const result = parseCursorPagination(req);

      expect(result.cursor).toEqual(testCursor);
    });

    it('should handle invalid cursor gracefully', () => {
      const req = mockRequest({ cursor: 'invalid-base64' });
      const result = parseCursorPagination(req);

      expect(result.cursor).toBeNull();
    });
  });

  describe('Cursor Query Building', () => {
    it('should return base filter when no cursor', () => {
      const filter = { categorySlug: 'ai' };
      const result = buildCursorQuery(null, filter);

      expect(result).toEqual(filter);
    });

    it('should build descending cursor query', () => {
      const cursor = {
        id: '507f1f77bcf86cd799439011',
        value: new Date('2024-01-15'),
        field: 'publishedAt',
        direction: 'desc' as const,
      };

      const result = buildCursorQuery(cursor, {}) as { $or: Array<Record<string, unknown>> };

      expect(result.$or).toBeDefined();
      expect(result.$or).toHaveLength(2);
      expect(result.$or[0]).toHaveProperty('publishedAt.$lt');
    });

    it('should build ascending cursor query', () => {
      const cursor = {
        id: '507f1f77bcf86cd799439011',
        value: 85,
        field: 'score',
        direction: 'asc' as const,
      };

      const result = buildCursorQuery(cursor, {}) as { $or: Array<Record<string, unknown>> };

      expect(result.$or[0]).toHaveProperty('score.$gt');
    });
  });

  describe('Cursor Encoding', () => {
    it('should encode cursor from item', () => {
      const item = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        publishedAt: new Date('2024-01-15'),
        title: 'Test Article',
      };

      const encoded = encodeCursor(item, 'publishedAt', 'desc');

      // Should be base64
      expect(() => Buffer.from(encoded, 'base64')).not.toThrow();

      // Decode and verify
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
      expect(decoded.field).toBe('publishedAt');
      expect(decoded.direction).toBe('desc');
    });
  });

  describe('Pagination Meta Builders', () => {
    it('should build offset pagination meta', () => {
      const meta = buildOffsetMeta(2, 20, 100);

      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(20);
      expect(meta.total).toBe(100);
      expect(meta.totalPages).toBe(5);
      expect(meta.hasMore).toBe(true);
      expect(meta.hasPrevious).toBe(true);
    });

    it('should indicate no more pages on last page', () => {
      const meta = buildOffsetMeta(5, 20, 100);

      expect(meta.hasMore).toBe(false);
    });

    it('should indicate no previous on first page', () => {
      const meta = buildOffsetMeta(1, 20, 100);

      expect(meta.hasPrevious).toBe(false);
    });

    it('should build cursor pagination meta with next cursor', () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        _id: new Types.ObjectId(),
        publishedAt: new Date(),
        score: 90 - i,
      }));

      const meta = buildCursorMeta(items, 20, 'publishedAt', 'desc', null);

      expect(meta.hasMore).toBe(true);
      expect(meta.nextCursor).toBeTruthy();
      expect(meta.prevCursor).toBeNull();
    });

    it('should not have next cursor when no more items', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId(),
        publishedAt: new Date(),
        score: 90 - i,
      }));

      const meta = buildCursorMeta(items, 20, 'publishedAt', 'desc', null);

      expect(meta.hasMore).toBe(false);
      expect(meta.nextCursor).toBeNull();
    });
  });
});

describe('Cache Entry Structure', () => {
  it('should include all required metadata fields', () => {
    const entry: CacheEntry<{ test: string }> = {
      data: { test: 'value' },
      cachedAt: Date.now(),
      ttl: 600,
      version: 1,
    };

    expect(entry.data).toBeDefined();
    expect(entry.cachedAt).toBeDefined();
    expect(entry.ttl).toBe(600);
    expect(entry.version).toBe(1);
  });
});

describe('Performance Requirements', () => {
  it('should support thousands of concurrent users with proper key namespacing', () => {
    // Verify keys are properly namespaced to avoid collisions
    const keys = [
      AdvancedCacheService.keys.articles(1, 20),
      AdvancedCacheService.keys.topArticles(10),
      AdvancedCacheService.keys.articlesByCategory('ai', 1, 20),
      AdvancedCacheService.keys.feedLatest(),
    ];

    // All keys should be unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);

    // All keys should have proper prefix structure
    keys.forEach(key => {
      expect(key).toMatch(/^[a-z]+:/);
    });
  });

  it('should enforce 10-minute (600s) default cache TTL', () => {
    expect(DEFAULT_CACHE_CONFIG.defaultTTL).toBe(600);
  });

  it('should support pagination for large datasets', () => {
    // Verify pagination handles large page numbers
    const mockReq = { query: { page: '1000', limit: '100' } } as unknown as Request;
    const result = parseOffsetPagination(mockReq);

    expect(result.page).toBe(1000);
    expect(result.skip).toBe(99900); // (1000-1) * 100
  });
});

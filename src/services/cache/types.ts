/**
 * Cache Types and Interfaces
 * Supports high-throughput caching for thousands of concurrent users
 */

export interface CacheConfig {
  /** Default TTL in seconds (default: 600 = 10 minutes) */
  defaultTTL: number;
  /** Maximum keys per pattern for bulk operations */
  maxKeysPerPattern: number;
  /** Enable cache statistics tracking */
  enableStats: boolean;
  /** Stale-while-revalidate window in seconds */
  staleWhileRevalidate: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsed: string;
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttl: number;
  version: number;
}

export interface CacheInvalidationEvent {
  type: 'article' | 'category' | 'feed' | 'all';
  patterns: string[];
  reason: string;
  timestamp: number;
}

export interface PaginationCursor {
  /** Last item ID for cursor-based pagination */
  lastId: string;
  /** Last item's sort value (score or date) */
  lastValue: number | string;
  /** Sort field being used */
  sortField: string;
  /** Sort direction */
  sortDirection: 'asc' | 'desc';
}

export interface CachingOptions {
  /** Cache key */
  key: string;
  /** TTL in seconds */
  ttl?: number;
  /** Enable stale-while-revalidate */
  staleWhileRevalidate?: boolean;
  /** Tags for grouped invalidation */
  tags?: string[];
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTTL: 600, // 10 minutes
  maxKeysPerPattern: 1000,
  enableStats: true,
  staleWhileRevalidate: 60, // 1 minute grace period
};

/**
 * Cache key prefixes for organized key management
 */
export const CACHE_PREFIXES = {
  ARTICLES: 'articles',
  ARTICLE: 'article',
  CATEGORY: 'category',
  FEED: 'feed',
  TOP: 'top',
  SEARCH: 'search',
  USER: 'user',
  STATS: 'stats',
  VERSION: 'version',
} as const;

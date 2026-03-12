/**
 * Advanced Redis Cache Manager
 * High-performance caching with pub/sub invalidation for thousands of users
 */

import { getRedisClient } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  CacheConfig,
  CacheStats,
  CacheEntry,
  CacheInvalidationEvent,
  DEFAULT_CACHE_CONFIG,
  CACHE_PREFIXES,
} from './types';

export class AdvancedCacheService {
  private redis = getRedisClient();
  private config: CacheConfig;
  private localStats = { hits: 0, misses: 0 };
  private cacheVersion = 1;
  private pubSubClient: ReturnType<typeof getRedisClient> | null = null;
  private isSubscribed = false;

  // Cache key generators
  static keys = {
    articles: (page: number, limit: number) => `${CACHE_PREFIXES.ARTICLES}:list:${page}:${limit}`,
    articleById: (id: string) => `${CACHE_PREFIXES.ARTICLE}:${id}`,
    topArticles: (limit?: number) => `${CACHE_PREFIXES.TOP}:articles${limit ? `:${limit}` : ''}`,
    articlesByCategory: (slug: string, page: number, limit: number) => 
      `${CACHE_PREFIXES.CATEGORY}:${slug}:${page}:${limit}`,
    categories: () => `${CACHE_PREFIXES.CATEGORY}:all`,
    feedLatest: () => `${CACHE_PREFIXES.FEED}:latest`,
    feedByCategory: (slug: string) => `${CACHE_PREFIXES.FEED}:category:${slug}`,
    userBookmarks: (userId: string) => `${CACHE_PREFIXES.USER}:${userId}:bookmarks`,
    searchResults: (query: string, page: number) => 
      `${CACHE_PREFIXES.SEARCH}:${Buffer.from(query).toString('base64').slice(0, 32)}:${page}`,
    version: () => `${CACHE_PREFIXES.VERSION}:global`,
    stats: () => `${CACHE_PREFIXES.STATS}:cache`,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Initialize cache service with pub/sub for invalidation
   */
  async initialize(): Promise<void> {
    try {
      // Load current cache version
      const version = await this.redis.get(AdvancedCacheService.keys.version());
      if (version) {
        this.cacheVersion = parseInt(version, 10);
      } else {
        await this.redis.set(AdvancedCacheService.keys.version(), '1');
      }

      // Setup pub/sub for cache invalidation (duplicate connection for pub/sub)
      await this.setupPubSub();
      
      logger.info('✅ Advanced cache service initialized');
    } catch (error) {
      logger.error('Failed to initialize cache service:', error);
    }
  }

  /**
   * Setup pub/sub for distributed cache invalidation
   */
  private async setupPubSub(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      this.pubSubClient = this.redis.duplicate();
      
      await this.pubSubClient.subscribe('cache:invalidate', (err) => {
        if (err) {
          logger.error('Failed to subscribe to cache invalidation channel:', err);
          return;
        }
        this.isSubscribed = true;
        logger.debug('Subscribed to cache:invalidate channel');
      });

      this.pubSubClient.on('message', async (channel, message) => {
        if (channel === 'cache:invalidate') {
          try {
            const event: CacheInvalidationEvent = JSON.parse(message);
            await this.handleInvalidationEvent(event);
          } catch (error) {
            logger.error('Failed to handle cache invalidation event:', error);
          }
        }
      });
    } catch (error) {
      logger.warn('Pub/sub setup failed, cache invalidation will be local only:', error);
    }
  }

  /**
   * Handle cache invalidation event from pub/sub
   */
  private async handleInvalidationEvent(event: CacheInvalidationEvent): Promise<void> {
    logger.debug(`Cache invalidation: ${event.type} - ${event.reason}`);
    
    for (const pattern of event.patterns) {
      await this.deletePattern(pattern);
    }
  }

  /**
   * Get cached value with stats tracking
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      
      if (!data) {
        this.localStats.misses++;
        if (this.config.enableStats) {
          await this.redis.hincrby(AdvancedCacheService.keys.stats(), 'misses', 1);
        }
        return null;
      }

      this.localStats.hits++;
      if (this.config.enableStats) {
        await this.redis.hincrby(AdvancedCacheService.keys.stats(), 'hits', 1);
      }

      const entry: CacheEntry<T> = JSON.parse(data);
      
      // Check if cache entry is from current version
      if (entry.version && entry.version !== this.cacheVersion) {
        await this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get multiple values in a single round trip
   */
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    if (keys.length === 0) return results;

    try {
      const values = await this.redis.mget(...keys);
      
      keys.forEach((key, index) => {
        const value = values[index];
        if (value) {
          try {
            const entry: CacheEntry<T> = JSON.parse(value);
            if (!entry.version || entry.version === this.cacheVersion) {
              results.set(key, entry.data);
              this.localStats.hits++;
            } else {
              results.set(key, null);
              this.localStats.misses++;
            }
          } catch {
            results.set(key, null);
            this.localStats.misses++;
          }
        } else {
          results.set(key, null);
          this.localStats.misses++;
        }
      });
    } catch (error) {
      logger.error('Cache mget error:', error);
      keys.forEach(key => results.set(key, null));
    }

    return results;
  }

  /**
   * Set cached value with entry metadata
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data: value,
        cachedAt: Date.now(),
        ttl: ttl || this.config.defaultTTL,
        version: this.cacheVersion,
      };

      const serialized = JSON.stringify(entry);
      const effectiveTTL = ttl || this.config.defaultTTL;

      if (effectiveTTL > 0) {
        await this.redis.setex(key, effectiveTTL, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Set multiple values in a single pipeline
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    if (entries.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();

      for (const { key, value, ttl } of entries) {
        const entry: CacheEntry<T> = {
          data: value,
          cachedAt: Date.now(),
          ttl: ttl || this.config.defaultTTL,
          version: this.cacheVersion,
        };
        const serialized = JSON.stringify(entry);
        const effectiveTTL = ttl || this.config.defaultTTL;

        if (effectiveTTL > 0) {
          pipeline.setex(key, effectiveTTL, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }

      await pipeline.exec();
    } catch (error) {
      logger.error('Cache mset error:', error);
    }
  }

  /**
   * Delete a single key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete keys matching a pattern (use sparingly)
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0' && deletedCount < this.config.maxKeysPerPattern);

      if (deletedCount > 0) {
        logger.debug(`Deleted ${deletedCount} cache keys matching ${pattern}`);
      }

      return deletedCount;
    } catch (error) {
      logger.error(`Cache deletePattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate cache and notify other instances via pub/sub
   */
  async invalidate(event: Omit<CacheInvalidationEvent, 'timestamp'>): Promise<void> {
    const fullEvent: CacheInvalidationEvent = {
      ...event,
      timestamp: Date.now(),
    };

    // Delete locally first
    await this.handleInvalidationEvent(fullEvent);

    // Publish to other instances
    try {
      await this.redis.publish('cache:invalidate', JSON.stringify(fullEvent));
    } catch (error) {
      logger.error('Failed to publish cache invalidation:', error);
    }
  }

  /**
   * Invalidate all article-related caches
   * Called when new articles are ingested
   */
  async invalidateArticleCaches(reason = 'new articles'): Promise<void> {
    await this.invalidate({
      type: 'article',
      patterns: [
        `${CACHE_PREFIXES.ARTICLES}:*`,
        `${CACHE_PREFIXES.TOP}:*`,
        `${CACHE_PREFIXES.FEED}:*`,
        `${CACHE_PREFIXES.CATEGORY}:*:*:*`, // category article lists
      ],
      reason,
    });
  }

  /**
   * Invalidate specific category caches
   */
  async invalidateCategoryCaches(categorySlug?: string): Promise<void> {
    const patterns = categorySlug
      ? [`${CACHE_PREFIXES.CATEGORY}:${categorySlug}:*`]
      : [`${CACHE_PREFIXES.CATEGORY}:*`];

    await this.invalidate({
      type: 'category',
      patterns,
      reason: 'category update',
    });
  }

  /**
   * Increment cache version to invalidate all entries
   */
  async incrementVersion(): Promise<number> {
    try {
      this.cacheVersion = await this.redis.incr(AdvancedCacheService.keys.version());
      logger.info(`Cache version incremented to ${this.cacheVersion}`);
      return this.cacheVersion;
    } catch (error) {
      logger.error('Failed to increment cache version:', error);
      return this.cacheVersion;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const [stats, info, dbSize] = await Promise.all([
        this.redis.hgetall(AdvancedCacheService.keys.stats()),
        this.redis.info('memory'),
        this.redis.dbsize(),
      ]);

      const hits = parseInt(stats?.hits || '0', 10) + this.localStats.hits;
      const misses = parseInt(stats?.misses || '0', 10) + this.localStats.misses;
      const total = hits + misses;

      // Extract memory usage from info
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

      return {
        hits,
        misses,
        hitRate: total > 0 ? (hits / total) * 100 : 0,
        totalKeys: dbSize,
        memoryUsed,
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {
        hits: this.localStats.hits,
        misses: this.localStats.misses,
        hitRate: 0,
        totalKeys: 0,
        memoryUsed: 'unknown',
      };
    }
  }

  /**
   * Cache-aside pattern with automatic fetch
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Cache the result
    await this.set(key, data, ttl);

    return data;
  }

  /**
   * Warm cache with pre-fetched data
   */
  async warmCache<T>(
    entries: Array<{ key: string; fetcher: () => Promise<T>; ttl?: number }>
  ): Promise<void> {
    const results = await Promise.allSettled(
      entries.map(async ({ key, fetcher, ttl }) => {
        const data = await fetcher();
        await this.set(key, data, ttl);
        return key;
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    logger.info(`Cache warmed: ${successful}/${entries.length} entries`);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return (await this.redis.exists(key)) === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL of a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.pubSubClient) {
      await this.pubSubClient.unsubscribe('cache:invalidate');
      await this.pubSubClient.quit();
      this.pubSubClient = null;
      this.isSubscribed = false;
    }
  }
}

// Singleton instance with 10-minute default TTL
export const advancedCache = new AdvancedCacheService({
  defaultTTL: 600, // 10 minutes as specified
});

export default advancedCache;

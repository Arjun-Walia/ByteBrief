import { getRedisClient } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class CacheService {
  private redis = getRedisClient();
  private defaultTTL = env.CACHE_TTL;

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl || this.defaultTTL) {
        await this.redis.setex(key, ttl || this.defaultTTL, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`Deleted ${keys.length} cache keys matching ${pattern}`);
      }
    } catch (error) {
      logger.error(`Cache deletePattern error for ${pattern}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async increment(key: string, amount = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  // Cache key generators
  static keys = {
    articles: (page: number, limit: number) => `articles:list:${page}:${limit}`,
    articleById: (id: string) => `articles:${id}`,
    topArticles: () => 'articles:top',
    articlesByCategory: (slug: string, page: number) => `articles:category:${slug}:${page}`,
    categories: () => 'categories:all',
    userBookmarks: (userId: string) => `user:${userId}:bookmarks`,
    searchResults: (query: string, page: number) => `search:${query}:${page}`,
  };
}

export const cacheService = new CacheService();

export default cacheService;

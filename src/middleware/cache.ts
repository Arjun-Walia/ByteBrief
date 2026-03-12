/**
 * API Response Caching Middleware
 * HTTP-level caching with ETag, Cache-Control headers, and conditional GET support
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { advancedCache, AdvancedCacheService } from '../services/cache/advancedCache';
import { logger } from '../utils/logger';

export interface CacheMiddlewareOptions {
  /** TTL in seconds (default: 600 = 10 minutes) */
  ttl?: number;
  /** Enable ETag generation */
  etag?: boolean;
  /** Private or public cache */
  cacheControl?: 'public' | 'private';
  /** Vary headers for cache key differentiation */
  vary?: string[];
  /** Cache key prefix */
  keyPrefix?: string;
  /** Skip caching for authenticated requests */
  skipAuth?: boolean;
  /** Custom key generator */
  keyGenerator?: (req: Request) => string;
}

const DEFAULT_OPTIONS: CacheMiddlewareOptions = {
  ttl: 600, // 10 minutes
  etag: true,
  cacheControl: 'public',
  vary: ['Accept-Encoding'],
  skipAuth: false,
};

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request, options: CacheMiddlewareOptions): string {
  if (options.keyGenerator) {
    return options.keyGenerator(req);
  }

  const prefix = options.keyPrefix || 'http';
  const method = req.method;
  const path = req.originalUrl || req.url;
  
  // Include relevant query params in key
  const queryString = Object.keys(req.query)
    .sort()
    .map(key => `${key}=${req.query[key]}`)
    .join('&');

  return `${prefix}:${method}:${path}${queryString ? `?${queryString}` : ''}`;
}

/**
 * Generate ETag from response body
 */
function generateETag(body: string | Buffer): string {
  const hash = crypto.createHash('md5').update(body).digest('hex');
  return `"${hash}"`;
}

/**
 * API Response Cache Middleware
 * Caches JSON responses with configurable TTL and ETag support
 */
export function apiCache(options: CacheMiddlewareOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    // Skip caching for authenticated requests if configured
    if (opts.skipAuth && req.headers.authorization) {
      next();
      return;
    }

    const cacheKey = generateCacheKey(req, opts);

    try {
      // Check cache
      const cached = await advancedCache.get<{
        body: string;
        etag: string;
        contentType: string;
        statusCode: number;
      }>(cacheKey);

      if (cached) {
        // Handle conditional GET with If-None-Match
        if (opts.etag && req.headers['if-none-match'] === cached.etag) {
          res.status(304).end();
          return;
        }

        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', `${opts.cacheControl}, max-age=${opts.ttl}`);
        
        if (opts.etag) {
          res.setHeader('ETag', cached.etag);
        }
        
        if (opts.vary && opts.vary.length > 0) {
          res.setHeader('Vary', opts.vary.join(', '));
        }

        res.status(cached.statusCode)
          .contentType(cached.contentType)
          .send(cached.body);
        return;
      }
    } catch (error) {
      logger.error('Cache middleware get error:', error);
      // Continue without cache on error
    }

    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Override json method to cache response
    res.json = (body: unknown): Response => {
      cacheResponse(JSON.stringify(body), 'application/json');
      return originalJson(body);
    };

    // Override send method to cache response
    res.send = (body: unknown): Response => {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        const bodyStr = typeof body === 'string' ? body : body.toString();
        const contentType = res.getHeader('Content-Type') as string || 'text/html';
        cacheResponse(bodyStr, contentType);
      }
      return originalSend(body);
    };

    // Cache response helper
    const cacheResponse = async (body: string, contentType: string): Promise<void> => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const etag = opts.etag ? generateETag(body) : '';
          
          await advancedCache.set(cacheKey, {
            body,
            etag,
            contentType,
            statusCode: res.statusCode,
          }, opts.ttl);

          // Set cache headers
          res.setHeader('X-Cache', 'MISS');
          res.setHeader('Cache-Control', `${opts.cacheControl}, max-age=${opts.ttl}`);
          
          if (opts.etag) {
            res.setHeader('ETag', etag);
          }
          
          if (opts.vary && opts.vary.length > 0) {
            res.setHeader('Vary', opts.vary.join(', '));
          }
        } catch (error) {
          logger.error('Cache middleware set error:', error);
        }
      }
    };

    next();
  };
}

/**
 * No-cache middleware for dynamic endpoints
 */
export function noCache(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}

/**
 * Cache invalidation middleware
 * Invalidates caches after mutation operations
 */
export function invalidateCache(patterns: string[]): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original methods
    const originalJson = res.json.bind(res);

    res.json = (body: unknown): Response => {
      // Invalidate cache after successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        patterns.forEach(pattern => {
          advancedCache.deletePattern(pattern).catch(err => {
            logger.error('Cache invalidation error:', err);
          });
        });
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Pre-configured cache middleware for common routes
 */
export const cacheMiddleware = {
  // Short cache for frequently changing data (5 min)
  short: apiCache({ ttl: 300 }),
  
  // Standard cache (10 min) - default for news feeds
  standard: apiCache({ ttl: 600 }),
  
  // Long cache for rarely changing data (30 min)
  long: apiCache({ ttl: 1800 }),
  
  // Static data cache (1 hour)
  static: apiCache({ ttl: 3600 }),
  
  // Private cache for user-specific data
  private: apiCache({ ttl: 600, cacheControl: 'private', skipAuth: false }),
  
  // No cache
  none: noCache,
};

export default cacheMiddleware;

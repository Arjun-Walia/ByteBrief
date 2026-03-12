/**
 * Compression Middleware Configuration
 * Enables gzip/deflate compression for API responses
 */

import compression from 'compression';
import { Request, Response } from 'express';

/**
 * Compression filter - determine which responses to compress
 */
function shouldCompress(req: Request, res: Response): boolean {
  // Don't compress if client doesn't accept encoding
  if (req.headers['x-no-compression']) {
    return false;
  }

  // Don't compress small responses (< 1KB)
  const contentLength = res.getHeader('Content-Length');
  if (contentLength && parseInt(contentLength as string, 10) < 1024) {
    return false;
  }

  // Don't compress already compressed content
  const contentEncoding = res.getHeader('Content-Encoding');
  if (contentEncoding && contentEncoding !== 'identity') {
    return false;
  }

  // Use default filter for everything else
  return compression.filter(req, res);
}

/**
 * Configured compression middleware
 * - Level 6 (balanced speed/compression)
 * - Threshold 1KB (don't compress tiny responses)
 * - Memory level 8 (good for JSON)
 */
export const compressionMiddleware = compression({
  filter: shouldCompress,
  level: 6, // Balanced compression (1-9, 6 is default)
  threshold: 1024, // Only compress responses > 1KB
  memLevel: 8, // Memory used for compression (1-9)
  chunkSize: 16 * 1024, // 16KB chunks
});

/**
 * High compression for large responses
 */
export const highCompressionMiddleware = compression({
  filter: shouldCompress,
  level: 9, // Maximum compression
  threshold: 10 * 1024, // Only for responses > 10KB
  memLevel: 9,
});

/**
 * Fast compression for real-time endpoints
 */
export const fastCompressionMiddleware = compression({
  filter: shouldCompress,
  level: 1, // Fastest compression
  threshold: 1024,
  memLevel: 4,
});

export default compressionMiddleware;

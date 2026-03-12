import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { env } from './config/env';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { initializeFirebase } from './config/firebase';
import { initializeScheduler } from './jobs/scheduler';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { compressionMiddleware } from './middleware/compression';
import { advancedCache } from './services/cache/advancedCache';
import { logger } from './utils/logger';

const app = express();

// Compression middleware (before other middlewares for best compression)
app.use(compressionMiddleware);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
}));

// CORS
app.use(cors({
  origin: env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', apiLimiter);

// Serve static files from client build (for production)
app.use(express.static(path.join(__dirname, '../client/dist')));

// API routes
app.use('/api', routes);

// Serve client app for non-API routes (SPA fallback)
app.get('*', (req, res, next) => {
  // Skip for API routes
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Connect to databases
    await connectDatabase();
    
    try {
      await connectRedis();
      // Initialize advanced cache with pub/sub for distributed invalidation
      await advancedCache.initialize();
    } catch (error) {
      logger.warn('Redis connection failed, continuing without cache:', error);
    }

    // Initialize Firebase
    initializeFirebase();

    // Initialize scheduled jobs
    if (env.NODE_ENV !== 'test') {
      initializeScheduler();
    }

    // Start listening
    app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
      logger.info(`📊 Environment: ${env.NODE_ENV}`);
      logger.info(`⚡ Performance: Compression enabled, Redis caching active`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;

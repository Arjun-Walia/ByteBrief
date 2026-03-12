/**
 * Health Check Routes
 * 
 * Comprehensive health monitoring endpoints for deployment and monitoring.
 */

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { cacheService } from '../services/cache/cacheService';
import { pipelineOrchestrator } from '../jobs/pipeline';
import { logger } from '../utils/logger';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  checks: {
    database: ComponentHealth;
    cache: ComponentHealth;
    pipeline: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * GET /api/health
 * Basic health check - fast response for load balancers
 */
router.get('/', async (req: Request, res: Response) => {
  const dbReady = mongoose.connection.readyState === 1;
  
  res.status(dbReady ? 200 : 503).json({
    success: dbReady,
    data: {
      status: dbReady ? 'healthy' : 'unhealthy',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/health/live
 * Kubernetes liveness probe - is the process running?
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/ready
 * Kubernetes readiness probe - can the service handle traffic?
 */
router.get('/ready', async (req: Request, res: Response) => {
  const isReady = mongoose.connection.readyState === 1;
  
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/detailed
 * Comprehensive health check with all dependencies
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check MongoDB
  const dbHealth = await checkDatabase();
  
  // Check Redis
  const cacheHealth = await checkCache();
  
  // Check Pipeline
  const pipelineHealth = checkPipeline();
  
  // Determine overall status
  const allHealthy = 
    dbHealth.status === 'up' && 
    cacheHealth.status === 'up';
  
  const anyDown = 
    dbHealth.status === 'down' || 
    cacheHealth.status === 'down';
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (allHealthy) {
    overallStatus = 'healthy';
  } else if (anyDown) {
    overallStatus = 'unhealthy';
  } else {
    overallStatus = 'degraded';
  }
  
  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: dbHealth,
      cache: cacheHealth,
      pipeline: pipelineHealth,
    },
  };
  
  const statusCode = overallStatus === 'healthy' ? 200 : 
                     overallStatus === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json({
    success: overallStatus !== 'unhealthy',
    data: healthStatus,
    responseTime: Date.now() - startTime,
  });
});

/**
 * GET /api/health/metrics
 * Prometheus-compatible metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response) => {
  const metrics = pipelineOrchestrator.getMetrics();
  const memUsage = process.memoryUsage();
  
  const prometheusMetrics = `
# HELP bytebrief_uptime_seconds Application uptime in seconds
# TYPE bytebrief_uptime_seconds gauge
bytebrief_uptime_seconds ${process.uptime()}

# HELP bytebrief_memory_heap_used_bytes Heap memory used
# TYPE bytebrief_memory_heap_used_bytes gauge
bytebrief_memory_heap_used_bytes ${memUsage.heapUsed}

# HELP bytebrief_memory_heap_total_bytes Total heap memory
# TYPE bytebrief_memory_heap_total_bytes gauge
bytebrief_memory_heap_total_bytes ${memUsage.heapTotal}

# HELP bytebrief_memory_rss_bytes Resident set size
# TYPE bytebrief_memory_rss_bytes gauge
bytebrief_memory_rss_bytes ${memUsage.rss}

# HELP bytebrief_pipeline_runs_total Total pipeline runs
# TYPE bytebrief_pipeline_runs_total counter
bytebrief_pipeline_runs_total ${metrics.totalRuns}

# HELP bytebrief_pipeline_successful_total Successful pipeline runs
# TYPE bytebrief_pipeline_successful_total counter
bytebrief_pipeline_successful_total ${metrics.successfulRuns}

# HELP bytebrief_pipeline_failed_total Failed pipeline runs
# TYPE bytebrief_pipeline_failed_total counter
bytebrief_pipeline_failed_total ${metrics.failedRuns}

# HELP bytebrief_pipeline_duration_ms Average pipeline duration
# TYPE bytebrief_pipeline_duration_ms gauge
bytebrief_pipeline_duration_ms ${metrics.averageDurationMs}

# HELP bytebrief_mongodb_connected MongoDB connection status
# TYPE bytebrief_mongodb_connected gauge
bytebrief_mongodb_connected ${mongoose.connection.readyState === 1 ? 1 : 0}
`.trim();

  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});

/**
 * Check MongoDB connection
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const startTime = Date.now();
  
  try {
    if (mongoose.connection.readyState !== 1) {
      return {
        status: 'down',
        message: 'MongoDB not connected',
        details: {
          readyState: mongoose.connection.readyState,
        },
      };
    }
    
    // Ping the database
    await mongoose.connection.db?.admin().ping();
    
    return {
      status: 'up',
      latency: Date.now() - startTime,
      details: {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
      },
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'down',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Redis connection
 */
async function checkCache(): Promise<ComponentHealth> {
  const startTime = Date.now();
  
  try {
    // Try to ping Redis via cache service
    await cacheService.get('health:ping');
    
    return {
      status: 'up',
      latency: Date.now() - startTime,
    };
  } catch (error) {
    // Redis might not be critical - mark as degraded
    logger.warn('Cache health check failed:', error);
    return {
      status: 'degraded',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Cache unavailable',
    };
  }
}

/**
 * Check pipeline status
 */
function checkPipeline(): ComponentHealth {
  const health = pipelineOrchestrator.getHealth();
  
  return {
    status: health.healthy ? 'up' : 'degraded',
    details: {
      consecutiveFailures: health.consecutiveFailures,
      lastRunStatus: health.lastRunStatus,
      lastRunAt: health.lastRunAt,
    },
  };
}

export default router;

/**
 * Pipeline Admin Routes
 * 
 * API endpoints for monitoring and controlling the news pipeline.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pipelineOrchestrator, PipelineStage } from '../jobs/pipeline';
import { logger } from '../utils/logger';

const router = Router();

// Simple admin auth middleware (should be replaced with proper auth in production)
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_API_KEY;
  
  // Skip auth in development or if no key is configured
  if (process.env.NODE_ENV === 'development' || !expectedKey) {
    return next();
  }
  
  if (adminKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }
  
  next();
};

/**
 * GET /api/admin/pipeline/health
 * Get pipeline health status
 */
router.get('/health', (req: Request, res: Response) => {
  const health = pipelineOrchestrator.getHealth();
  
  res.json({
    success: true,
    data: health,
  });
});

/**
 * GET /api/admin/pipeline/metrics
 * Get pipeline metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const metrics = pipelineOrchestrator.getMetrics();
  
  res.json({
    success: true,
    data: metrics,
  });
});

/**
 * GET /api/admin/pipeline/state
 * Get current pipeline state
 */
router.get('/state', (req: Request, res: Response) => {
  const state = pipelineOrchestrator.getState();
  
  res.json({
    success: true,
    data: {
      currentStage: state.currentStage,
      status: state.status,
      startedAt: state.startedAt,
      consecutiveFailures: state.consecutiveFailures,
      lastRun: state.lastRun ? {
        pipelineId: state.lastRun.pipelineId,
        status: state.lastRun.status,
        completedAt: state.lastRun.completedAt,
        duration: state.lastRun.totalDuration,
        summary: state.lastRun.summary,
      } : null,
    },
  });
});

/**
 * GET /api/admin/pipeline/history
 * Get pipeline run history
 */
router.get('/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const state = pipelineOrchestrator.getState();
  
  const history = state.runHistory
    .slice(-limit)
    .reverse()
    .map(run => ({
      pipelineId: run.pipelineId,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      duration: run.totalDuration,
      summary: run.summary,
    }));
  
  res.json({
    success: true,
    data: {
      total: state.runHistory.length,
      history,
    },
  });
});

/**
 * POST /api/admin/pipeline/run
 * Trigger a pipeline run
 */
router.post('/run', adminAuth, async (req: Request, res: Response) => {
  const { stages, stopOnFailure = true, skipNotifications = false } = req.body;
  
  logger.info('[API] Pipeline run triggered via API');
  
  // Validate stages if provided
  let stagesToRun: PipelineStage[] | undefined;
  if (stages && Array.isArray(stages)) {
    const validStages = Object.values(PipelineStage);
    stagesToRun = stages.filter(s => validStages.includes(s));
    
    if (stagesToRun.length !== stages.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stages provided',
        validStages,
      });
    }
  }
  
  try {
    // Run asynchronously and return immediately
    const runPromise = pipelineOrchestrator.run({
      stages: stagesToRun,
      stopOnFailure,
      skipNotifications,
    });
    
    // If async param is true, return immediately
    if (req.query.async === 'true') {
      res.json({
        success: true,
        data: {
          message: 'Pipeline run started',
          status: 'running',
        },
      });
      
      // Handle result in background
      runPromise.then(result => {
        logger.info(`[API] Async pipeline run completed: ${result.status}`);
      }).catch(error => {
        logger.error('[API] Async pipeline run failed:', error);
      });
      
      return;
    }
    
    // Wait for completion
    const result = await runPromise;
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[API] Pipeline run failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Pipeline run failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/admin/pipeline/run/ingestion
 * Run only ingestion pipeline
 */
router.post('/run/ingestion', adminAuth, async (req: Request, res: Response) => {
  logger.info('[API] Ingestion pipeline triggered via API');
  
  try {
    const result = await pipelineOrchestrator.runIngestionPipeline();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[API] Ingestion pipeline failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Ingestion pipeline failed',
    });
  }
});

/**
 * POST /api/admin/pipeline/run/ranking
 * Run only ranking pipeline
 */
router.post('/run/ranking', adminAuth, async (req: Request, res: Response) => {
  logger.info('[API] Ranking pipeline triggered via API');
  
  try {
    const result = await pipelineOrchestrator.runRankingPipeline();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[API] Ranking pipeline failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Ranking pipeline failed',
    });
  }
});

/**
 * POST /api/admin/pipeline/run/notify
 * Run only notification pipeline
 */
router.post('/run/notify', adminAuth, async (req: Request, res: Response) => {
  logger.info('[API] Notification pipeline triggered via API');
  
  try {
    const result = await pipelineOrchestrator.runNotificationPipeline();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[API] Notification pipeline failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Notification pipeline failed',
    });
  }
});

/**
 * POST /api/admin/pipeline/reset-failures
 * Reset consecutive failures counter
 */
router.post('/reset-failures', adminAuth, (req: Request, res: Response) => {
  pipelineOrchestrator.resetFailures();
  
  res.json({
    success: true,
    data: {
      message: 'Failures counter reset',
    },
  });
});

export default router;

/**
 * Pipeline Orchestrator
 * 
 * Coordinates the execution of all pipeline stages sequentially
 * with retry logic, timeouts, and comprehensive logging.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import {
  PipelineStage,
  PipelineStatus,
  PipelineConfig,
  PipelineResult,
  PipelineState,
  PipelineMetrics,
  StageResult,
  DEFAULT_PIPELINE_CONFIG,
} from './types';
import { stageRunners } from './stages';

/**
 * Default stage execution order
 */
const DEFAULT_STAGE_ORDER: PipelineStage[] = [
  PipelineStage.FETCH,
  PipelineStage.SUMMARIZE,
  PipelineStage.RANK,
  PipelineStage.CLUSTER,
  PipelineStage.CACHE,
  PipelineStage.NOTIFY,
];

/**
 * Lightweight pipeline order (skip notifications)
 */
const LIGHTWEIGHT_STAGE_ORDER: PipelineStage[] = [
  PipelineStage.FETCH,
  PipelineStage.SUMMARIZE,
  PipelineStage.RANK,
  PipelineStage.CLUSTER,
  PipelineStage.CACHE,
];

export class PipelineOrchestrator {
  private config: PipelineConfig;
  private state: PipelineState;
  private metrics: PipelineMetrics;
  private runHistoryLimit = 100;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    
    this.state = {
      currentStage: null,
      status: PipelineStatus.IDLE,
      startedAt: null,
      lastRun: null,
      runHistory: [],
      consecutiveFailures: 0,
    };
    
    this.metrics = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDurationMs: 0,
      lastRunAt: null,
      uptime: Date.now(),
      stageMetrics: {} as PipelineMetrics['stageMetrics'],
    };
    
    // Initialize stage metrics
    for (const stage of Object.values(PipelineStage)) {
      this.metrics.stageMetrics[stage] = {
        runs: 0,
        successes: 0,
        failures: 0,
        avgDuration: 0,
      };
    }
    
    logger.info('[Pipeline] Orchestrator initialized');
  }

  /**
   * Run a single stage with retry logic
   */
  private async runStageWithRetry(
    stage: PipelineStage,
    attempt = 1
  ): Promise<StageResult> {
    const maxRetries = this.config.maxRetries;
    
    try {
      const runner = stageRunners[stage];
      const result = await runner(this.config);
      
      // Update metrics
      const stageMetrics = this.metrics.stageMetrics[stage];
      stageMetrics.runs++;
      if (result.success) {
        stageMetrics.successes++;
      } else {
        stageMetrics.failures++;
      }
      stageMetrics.avgDuration = 
        (stageMetrics.avgDuration * (stageMetrics.runs - 1) + result.duration) / stageMetrics.runs;
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (attempt < maxRetries) {
        logger.warn(
          `[Pipeline] Stage ${stage} failed (attempt ${attempt}/${maxRetries}): ${errorMessage}. Retrying...`
        );
        
        // Wait before retry with exponential backoff
        await this.sleep(this.config.retryDelayMs * Math.pow(2, attempt - 1));
        
        return this.runStageWithRetry(stage, attempt + 1);
      }
      
      logger.error(`[Pipeline] Stage ${stage} failed after ${maxRetries} attempts: ${errorMessage}`);
      
      // Update metrics for failure
      const stageMetrics = this.metrics.stageMetrics[stage];
      stageMetrics.runs++;
      stageMetrics.failures++;
      
      return {
        stage,
        success: false,
        duration: 0,
        itemsProcessed: 0,
        error: `Failed after ${maxRetries} attempts: ${errorMessage}`,
        startedAt: new Date(),
        completedAt: new Date(),
      };
    }
  }

  /**
   * Execute the full pipeline
   */
  async run(options?: {
    stages?: PipelineStage[];
    stopOnFailure?: boolean;
    skipNotifications?: boolean;
  }): Promise<PipelineResult> {
    const pipelineId = uuidv4();
    const startTime = new Date();
    
    // Determine which stages to run
    let stagesToRun = options?.stages || 
      (options?.skipNotifications ? LIGHTWEIGHT_STAGE_ORDER : DEFAULT_STAGE_ORDER);
    
    // Filter out disabled stages
    stagesToRun = stagesToRun.filter(stage => {
      const stageConfig = this.config.stages[stage];
      return stageConfig?.enabled !== false;
    });
    
    const stopOnFailure = options?.stopOnFailure ?? true;
    
    // Check if pipeline is already running
    if (this.state.status === PipelineStatus.RUNNING) {
      logger.warn('[Pipeline] Pipeline is already running, skipping');
      return {
        pipelineId,
        status: PipelineStatus.IDLE,
        startedAt: startTime,
        completedAt: new Date(),
        totalDuration: 0,
        stageResults: [],
        summary: {
          totalStages: 0,
          successfulStages: 0,
          failedStages: 0,
          totalItemsProcessed: 0,
        },
      };
    }
    
    // Update state
    this.state.status = PipelineStatus.RUNNING;
    this.state.startedAt = startTime;
    
    logger.info('═'.repeat(60));
    logger.info(`[Pipeline] Starting pipeline run: ${pipelineId}`);
    logger.info(`[Pipeline] Stages to run: ${stagesToRun.join(' → ')}`);
    logger.info('═'.repeat(60));
    
    const stageResults: StageResult[] = [];
    let hasFailure = false;
    
    // Run each stage sequentially
    for (const stage of stagesToRun) {
      this.state.currentStage = stage;
      
      logger.info('─'.repeat(40));
      logger.info(`[Pipeline] Stage: ${stage.toUpperCase()}`);
      logger.info('─'.repeat(40));
      
      const result = await this.runStageWithRetry(stage);
      stageResults.push(result);
      
      if (!result.success) {
        hasFailure = true;
        
        if (stopOnFailure) {
          logger.error(`[Pipeline] Stopping pipeline due to failure in stage: ${stage}`);
          break;
        } else {
          logger.warn(`[Pipeline] Continuing despite failure in stage: ${stage}`);
        }
      }
      
      // Log stage completion
      logger.info(
        `[Pipeline] Stage ${stage} completed: ` +
        `${result.success ? '✓' : '✗'} | ` +
        `${result.itemsProcessed} items | ` +
        `${result.duration}ms`
      );
    }
    
    // Calculate final result
    const completedAt = new Date();
    const totalDuration = completedAt.getTime() - startTime.getTime();
    
    const successfulStages = stageResults.filter(r => r.success).length;
    const failedStages = stageResults.filter(r => !r.success).length;
    const totalItemsProcessed = stageResults.reduce((sum, r) => sum + r.itemsProcessed, 0);
    
    // Determine final status
    let finalStatus: PipelineStatus;
    if (failedStages === 0) {
      finalStatus = PipelineStatus.COMPLETED;
      this.state.consecutiveFailures = 0;
    } else if (successfulStages === 0) {
      finalStatus = PipelineStatus.FAILED;
      this.state.consecutiveFailures++;
    } else {
      finalStatus = PipelineStatus.PARTIAL;
      this.state.consecutiveFailures++;
    }
    
    const result: PipelineResult = {
      pipelineId,
      status: finalStatus,
      startedAt: startTime,
      completedAt,
      totalDuration,
      stageResults,
      summary: {
        totalStages: stagesToRun.length,
        successfulStages,
        failedStages,
        totalItemsProcessed,
      },
    };
    
    // Update state and metrics
    this.state.status = PipelineStatus.IDLE;
    this.state.currentStage = null;
    this.state.lastRun = result;
    this.state.runHistory.push(result);
    
    // Trim history
    if (this.state.runHistory.length > this.runHistoryLimit) {
      this.state.runHistory = this.state.runHistory.slice(-this.runHistoryLimit);
    }
    
    // Update metrics
    this.metrics.totalRuns++;
    this.metrics.lastRunAt = completedAt;
    if (finalStatus === PipelineStatus.COMPLETED) {
      this.metrics.successfulRuns++;
    } else {
      this.metrics.failedRuns++;
    }
    this.metrics.averageDurationMs = 
      (this.metrics.averageDurationMs * (this.metrics.totalRuns - 1) + totalDuration) / this.metrics.totalRuns;
    
    // Log final summary
    logger.info('═'.repeat(60));
    logger.info(`[Pipeline] Pipeline ${pipelineId} completed`);
    logger.info(`[Pipeline] Status: ${finalStatus.toUpperCase()}`);
    logger.info(`[Pipeline] Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    logger.info(`[Pipeline] Stages: ${successfulStages}/${stagesToRun.length} successful`);
    logger.info(`[Pipeline] Items processed: ${totalItemsProcessed}`);
    logger.info('═'.repeat(60));
    
    // Log individual stage results
    for (const stageResult of stageResults) {
      const statusIcon = stageResult.success ? '✓' : '✗';
      logger.info(
        `  ${statusIcon} ${stageResult.stage}: ` +
        `${stageResult.itemsProcessed} items in ${stageResult.duration}ms` +
        (stageResult.error ? ` (Error: ${stageResult.error})` : '')
      );
    }
    
    return result;
  }

  /**
   * Run only the ingestion and processing stages (no notifications)
   */
  async runIngestionPipeline(): Promise<PipelineResult> {
    return this.run({
      stages: [
        PipelineStage.FETCH,
        PipelineStage.SUMMARIZE,
        PipelineStage.RANK,
        PipelineStage.CLUSTER,
        PipelineStage.CACHE,
      ],
    });
  }

  /**
   * Run only the ranking and cache update stages
   */
  async runRankingPipeline(): Promise<PipelineResult> {
    return this.run({
      stages: [
        PipelineStage.RANK,
        PipelineStage.CLUSTER,
        PipelineStage.CACHE,
      ],
    });
  }

  /**
   * Run only the notification stage
   */
  async runNotificationPipeline(): Promise<PipelineResult> {
    return this.run({
      stages: [PipelineStage.NOTIFY],
    });
  }

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.uptime,
    };
  }

  /**
   * Get health status
   */
  getHealth(): {
    healthy: boolean;
    status: PipelineStatus;
    consecutiveFailures: number;
    lastRunStatus: PipelineStatus | null;
    lastRunAt: Date | null;
  } {
    const healthy = this.state.consecutiveFailures < 3;
    
    return {
      healthy,
      status: this.state.status,
      consecutiveFailures: this.state.consecutiveFailures,
      lastRunStatus: this.state.lastRun?.status || null,
      lastRunAt: this.state.lastRun?.completedAt || null,
    };
  }

  /**
   * Reset consecutive failures counter
   */
  resetFailures(): void {
    this.state.consecutiveFailures = 0;
    logger.info('[Pipeline] Consecutive failures counter reset');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[Pipeline] Configuration updated');
  }

  /**
   * Helper: Sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const pipelineOrchestrator = new PipelineOrchestrator();

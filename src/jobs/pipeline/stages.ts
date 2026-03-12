/**
 * Pipeline Stage Runners
 * 
 * Individual stage implementations with error handling.
 */

import { ingestionOrchestrator } from '../../services/ingestion/orchestrator';
import { summarizationService } from '../../services/processing/summarization';
import { rankingService } from '../../services/ranking/ranker';
import { clusteringService } from '../../services/clustering';
import { pushService } from '../../services/notification/pushService';
import { cacheService } from '../../services/cache/cacheService';
import { logger } from '../../utils/logger';
import { PipelineStage, StageResult, PipelineConfig } from './types';

export type StageRunner = (config: PipelineConfig) => Promise<StageResult>;

/**
 * Creates a stage result object
 */
function createStageResult(
  stage: PipelineStage,
  success: boolean,
  startTime: Date,
  itemsProcessed: number,
  details?: Record<string, unknown>,
  error?: string
): StageResult {
  const completedAt = new Date();
  return {
    stage,
    success,
    duration: completedAt.getTime() - startTime.getTime(),
    itemsProcessed,
    error,
    details,
    startedAt: startTime,
    completedAt,
  };
}

/**
 * Stage 1: Fetch news from all sources
 */
export async function runFetchStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.FETCH;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    const result = await ingestionOrchestrator.runIngestion();
    
    const details = {
      totalFetched: result.totalFetched,
      totalNew: result.totalNew,
      totalDuplicates: result.totalDuplicates,
      sourceResults: result.sourceResults.map(sr => ({
        source: sr.source,
        fetched: sr.fetched,
        new: sr.new,
        errors: sr.errors,
      })),
    };
    
    logger.info(`[Pipeline] Fetch complete: ${result.totalFetched} fetched, ${result.totalNew} new`);
    
    return createStageResult(stage, true, startTime, result.totalNew, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Fetch failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Stage 2: Remove duplicates (handled during ingestion, but we can run clustering here)
 */
export async function runDedupeStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.DEDUPE;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    // Clustering service handles deduplication by grouping similar articles
    const result = await clusteringService.runClustering();
    
    const details = {
      clustersCreated: result.clustersCreated,
      articlesAssigned: result.articlesAssigned,
      duplicatesFound: result.articlesAssigned - result.clustersCreated,
    };
    
    logger.info(`[Pipeline] Dedupe complete: ${result.clustersCreated} clusters, ${result.articlesAssigned} articles grouped`);
    
    return createStageResult(stage, true, startTime, result.articlesAssigned, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Dedupe failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Stage 3: Generate AI summaries for unsummarized articles
 */
export async function runSummarizeStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.SUMMARIZE;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    const batchSize = config.stages.summarize.batchSize;
    const count = await summarizationService.summarizeUnsummarizedArticles(batchSize);
    
    const details = {
      articlesSummarized: count,
      batchSize,
    };
    
    logger.info(`[Pipeline] Summarization complete: ${count} articles summarized`);
    
    return createStageResult(stage, true, startTime, count, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Summarization failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Stage 4: Rank all articles
 */
export async function runRankStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.RANK;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    const count = await rankingService.rankAllArticles();
    
    const details = {
      articlesRanked: count,
    };
    
    logger.info(`[Pipeline] Ranking complete: ${count} articles ranked`);
    
    return createStageResult(stage, true, startTime, count, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Ranking failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Stage 5: Cluster related articles
 */
export async function runClusterStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.CLUSTER;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    const result = await clusteringService.runClustering();
    
    const details = {
      clustersCreated: result.clustersCreated,
      articlesAssigned: result.articlesAssigned,
    };
    
    logger.info(`[Pipeline] Clustering complete: ${result.clustersCreated} clusters created`);
    
    return createStageResult(stage, true, startTime, result.clustersCreated, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Clustering failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Stage 6: Update caches
 */
export async function runCacheStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.CACHE;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    const patterns = config.stages.cache.clearPatterns;
    let clearedCount = 0;
    
    for (const pattern of patterns) {
      await cacheService.deletePattern(pattern);
      clearedCount++;
    }
    
    const details = {
      patternsCleared: patterns,
      patternCount: patterns.length,
    };
    
    logger.info(`[Pipeline] Cache clear complete: ${patterns.length} patterns cleared`);
    
    return createStageResult(stage, true, startTime, clearedCount, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Cache clear failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Stage 7: Send notifications
 */
export async function runNotifyStage(config: PipelineConfig): Promise<StageResult> {
  const startTime = new Date();
  const stage = PipelineStage.NOTIFY;
  
  logger.info(`[Pipeline] Starting stage: ${stage}`);
  
  try {
    let notificationsSent = 0;
    const details: Record<string, unknown> = {};
    
    if (config.stages.notify.sendDigest) {
      await pushService.sendDailyDigest();
      details.digestSent = true;
      notificationsSent++;
    }
    
    // TODO: Implement breaking news detection and notification
    if (config.stages.notify.sendBreakingNews) {
      details.breakingNewsSent = false; // Not implemented yet
    }
    
    logger.info(`[Pipeline] Notifications complete: ${notificationsSent} notification batches sent`);
    
    return createStageResult(stage, true, startTime, notificationsSent, details);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[Pipeline] Notifications failed: ${errorMessage}`);
    return createStageResult(stage, false, startTime, 0, undefined, errorMessage);
  }
}

/**
 * Map of stage names to their runners
 */
export const stageRunners: Record<PipelineStage, StageRunner> = {
  [PipelineStage.FETCH]: runFetchStage,
  [PipelineStage.DEDUPE]: runDedupeStage,
  [PipelineStage.SUMMARIZE]: runSummarizeStage,
  [PipelineStage.RANK]: runRankStage,
  [PipelineStage.CLUSTER]: runClusterStage,
  [PipelineStage.CACHE]: runCacheStage,
  [PipelineStage.NOTIFY]: runNotifyStage,
};

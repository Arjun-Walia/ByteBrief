import cron from 'node-cron';
import { env } from '../config/env';
import { pipelineOrchestrator, PipelineStage } from './pipeline';
import { logger } from '../utils/logger';

export const initializeScheduler = (): void => {
  logger.info('Initializing scheduled jobs with pipeline orchestrator...');

  // Main ingestion pipeline - runs every 6 hours by default
  // Fetches news → Summarizes → Ranks → Clusters → Updates cache
  cron.schedule(env.INGESTION_CRON, async () => {
    logger.info('═'.repeat(60));
    logger.info('[Scheduler] Starting scheduled ingestion pipeline...');
    logger.info('═'.repeat(60));
    
    try {
      const result = await pipelineOrchestrator.runIngestionPipeline();
      
      logger.info(`[Scheduler] Ingestion pipeline completed: ${result.status}`);
      logger.info(`[Scheduler] Summary: ${result.summary.successfulStages}/${result.summary.totalStages} stages successful`);
      logger.info(`[Scheduler] Items processed: ${result.summary.totalItemsProcessed}`);
      logger.info(`[Scheduler] Duration: ${(result.totalDuration / 1000).toFixed(1)}s`);
    } catch (error) {
      logger.error('[Scheduler] Ingestion pipeline failed:', error);
    }
  });

  // Ranking pipeline - runs every 6 hours by default (offset from ingestion)
  // Re-ranks articles → Updates clusters → Clears cache
  cron.schedule(env.RANKING_CRON, async () => {
    logger.info('═'.repeat(60));
    logger.info('[Scheduler] Starting scheduled ranking pipeline...');
    logger.info('═'.repeat(60));
    
    try {
      const result = await pipelineOrchestrator.runRankingPipeline();
      
      logger.info(`[Scheduler] Ranking pipeline completed: ${result.status}`);
      logger.info(`[Scheduler] Summary: ${result.summary.successfulStages}/${result.summary.totalStages} stages successful`);
    } catch (error) {
      logger.error('[Scheduler] Ranking pipeline failed:', error);
    }
  });

  // Daily notification pipeline - runs at 8 AM by default
  // Sends daily digest to subscribed users
  cron.schedule(env.NOTIFICATION_CRON, async () => {
    logger.info('═'.repeat(60));
    logger.info('[Scheduler] Starting scheduled notification pipeline...');
    logger.info('═'.repeat(60));
    
    try {
      const result = await pipelineOrchestrator.runNotificationPipeline();
      
      logger.info(`[Scheduler] Notification pipeline completed: ${result.status}`);
    } catch (error) {
      logger.error('[Scheduler] Notification pipeline failed:', error);
    }
  });

  // Cache cleanup job - runs at 2 AM daily
  cron.schedule(env.CLEANUP_CRON, async () => {
    logger.info('[Scheduler] Starting scheduled cache cleanup...');
    
    try {
      const result = await pipelineOrchestrator.run({
        stages: [PipelineStage.CACHE],
      });
      
      logger.info(`[Scheduler] Cache cleanup completed: ${result.status}`);
    } catch (error) {
      logger.error('[Scheduler] Cache cleanup failed:', error);
    }
  });

  // Log next scheduled runs
  logger.info('─'.repeat(60));
  logger.info('[Scheduler] Scheduled jobs configured:');
  logger.info(`  • Ingestion pipeline: ${env.INGESTION_CRON}`);
  logger.info(`  • Ranking pipeline: ${env.RANKING_CRON}`);
  logger.info(`  • Notification pipeline: ${env.NOTIFICATION_CRON}`);
  logger.info(`  • Cache cleanup: ${env.CLEANUP_CRON}`);
  logger.info('─'.repeat(60));
  
  logger.info('[Scheduler] All scheduled jobs initialized');
};

export default { initializeScheduler };

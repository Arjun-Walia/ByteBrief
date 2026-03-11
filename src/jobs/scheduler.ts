import cron from 'node-cron';
import { env } from '../config/env';
import { ingestionOrchestrator } from '../services/ingestion/orchestrator';
import { summarizationService } from '../services/processing/summarization';
import { rankingService } from '../services/ranking/ranker';
import { clusteringService } from '../services/clustering';
import { pushService } from '../services/notification/pushService';
import { cacheService } from '../services/cache/cacheService';
import { logger } from '../utils/logger';

export const initializeScheduler = (): void => {
  logger.info('Initializing scheduled jobs...');

  // Ingestion job - runs every 6 hours by default
  cron.schedule(env.INGESTION_CRON, async () => {
    logger.info('Starting news ingestion job...');
    try {
      const result = await ingestionOrchestrator.runIngestion();
      logger.info(`Ingestion complete: ${result.totalFetched} fetched, ${result.totalNew} new, ${result.totalDuplicates} duplicates`);
      
      for (const sourceResult of result.sourceResults) {
        logger.info(`  ${sourceResult.source}: ${sourceResult.fetched} fetched, ${sourceResult.new} stored`);
      }

      // Trigger summarization after ingestion
      await summarizationService.summarizeUnsummarizedArticles();
    } catch (error) {
      logger.error('Ingestion job failed:', error);
    }
  });

  // Ranking job - runs every 6 hours by default
  cron.schedule(env.RANKING_CRON, async () => {
    logger.info('Starting ranking job...');
    try {
      const count = await rankingService.rankAllArticles();
      logger.info(`Ranking complete: ${count} articles ranked`);
      
      // Run clustering after ranking
      logger.info('Starting article clustering...');
      const clusterResult = await clusteringService.runClustering();
      logger.info(
        `Clustering complete: ${clusterResult.clustersCreated} clusters, ` +
        `${clusterResult.articlesAssigned} articles assigned`
      );
      
      // Clear article caches after re-ranking
      await cacheService.deletePattern('articles:*');
    } catch (error) {
      logger.error('Ranking job failed:', error);
    }
  });

  // Daily notification job - runs at 8 AM by default
  cron.schedule(env.NOTIFICATION_CRON, async () => {
    logger.info('Starting daily notification job...');
    try {
      await pushService.sendDailyDigest();
    } catch (error) {
      logger.error('Notification job failed:', error);
    }
  });

  // Cache cleanup job - runs at 2 AM daily
  cron.schedule(env.CLEANUP_CRON, async () => {
    logger.info('Starting cache cleanup job...');
    try {
      await cacheService.deletePattern('*');
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache cleanup job failed:', error);
    }
  });

  logger.info('Scheduled jobs initialized');
};

export default { initializeScheduler };

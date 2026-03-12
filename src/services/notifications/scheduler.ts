/**
 * Notification Scheduler
 * 
 * Handles scheduled notification jobs:
 * - Daily digest at configured time
 * - Breaking news detection on new articles
 * - Topic alerts for category updates
 * - Failed notification retries
 */

import cron from 'node-cron';
import { Article } from '../../models';
import { IArticle } from '../../models/Article';
import { logger } from '../../utils/logger';
import {
  sendBreakingNews,
  sendDailyDigest,
  sendTopicAlert,
  retryFailedNotifications,
  detectBreakingNews,
} from './notificationService';

// Configuration
const CONFIG = {
  DIGEST_CRON: process.env.DIGEST_CRON || '0 8 * * *',     // 8 AM daily
  BREAKING_CHECK_CRON: '*/15 * * * *',                      // Every 15 minutes
  RETRY_CRON: '0 */4 * * *',                                // Every 4 hours
  BREAKING_NEWS_COOLDOWN_MS: 60 * 60 * 1000,                // 1 hour between breaking alerts
};

// Track last breaking news alert to prevent spam
let lastBreakingNewsTime = 0;
let lastCheckedArticle: string | null = null;

/**
 * Initialize notification scheduler
 */
export function initNotificationScheduler(): void {
  logger.info('📅 Initializing notification scheduler...');

  // Daily digest - configurable time (default 8 AM)
  cron.schedule(CONFIG.DIGEST_CRON, async () => {
    logger.info('🌅 Running daily digest job');
    try {
      await runDailyDigestJob();
    } catch (error) {
      logger.error('Daily digest job failed:', error);
    }
  });

  // Breaking news check - every 15 minutes
  cron.schedule(CONFIG.BREAKING_CHECK_CRON, async () => {
    try {
      await runBreakingNewsCheck();
    } catch (error) {
      logger.error('Breaking news check failed:', error);
    }
  });

  // Retry failed notifications - every 4 hours
  cron.schedule(CONFIG.RETRY_CRON, async () => {
    logger.info('🔄 Running notification retry job');
    try {
      await retryFailedNotifications();
    } catch (error) {
      logger.error('Notification retry job failed:', error);
    }
  });

  logger.info('✅ Notification scheduler initialized', {
    digest: CONFIG.DIGEST_CRON,
    breakingCheck: CONFIG.BREAKING_CHECK_CRON,
    retry: CONFIG.RETRY_CRON,
  });
}

/**
 * Run daily digest notification job
 */
export async function runDailyDigestJob(): Promise<void> {
  const startTime = Date.now();
  
  logger.info('📰 Starting daily digest notification job');
  
  try {
    const result = await sendDailyDigest();
    
    const duration = Date.now() - startTime;
    logger.info('📰 Daily digest job completed', {
      duration: `${duration}ms`,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error: any) {
    logger.error('Daily digest job error:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Check for breaking news among recent articles
 */
export async function runBreakingNewsCheck(): Promise<void> {
  // Cooldown check
  const now = Date.now();
  if (now - lastBreakingNewsTime < CONFIG.BREAKING_NEWS_COOLDOWN_MS) {
    logger.debug('Breaking news check skipped - cooldown active');
    return;
  }

  // Get articles from last hour that haven't been checked
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  
  const recentArticles = await Article.find({
    publishedAt: { $gte: oneHourAgo },
    ...(lastCheckedArticle ? { _id: { $gt: lastCheckedArticle } } : {}),
  })
    .sort({ publishedAt: -1, score: -1 })
    .limit(20)
    .lean() as unknown as IArticle[];

  if (recentArticles.length === 0) {
    return;
  }

  logger.debug(`Checking ${recentArticles.length} articles for breaking news`);

  // Find the most important breaking article
  let bestCandidate: { article: IArticle; score: number } | null = null;

  for (const article of recentArticles) {
    const detection = detectBreakingNews(article);
    
    if (detection.isBreaking) {
      if (!bestCandidate || detection.score > bestCandidate.score) {
        bestCandidate = {
          article,
          score: detection.score,
        };
      }
    }
  }

  // Update last checked
  lastCheckedArticle = recentArticles[0]._id?.toString() || null;

  // Send notification for best candidate
  if (bestCandidate) {
    logger.info(`🚨 Breaking news candidate found: ${bestCandidate.article.title}`);
    
    const result = await sendBreakingNews(bestCandidate.article);
    
    if (result && result.successCount > 0) {
      lastBreakingNewsTime = now;
      logger.info('Breaking news notification sent successfully');
    }
  }
}

/**
 * Trigger breaking news notification manually
 * Called when a new high-score article is ingested
 */
export async function triggerBreakingNewsCheck(article: IArticle): Promise<boolean> {
  const now = Date.now();
  
  // Cooldown check
  if (now - lastBreakingNewsTime < CONFIG.BREAKING_NEWS_COOLDOWN_MS) {
    logger.debug('Breaking news trigger skipped - cooldown active');
    return false;
  }

  const detection = detectBreakingNews(article);
  
  if (!detection.isBreaking) {
    return false;
  }

  const result = await sendBreakingNews(article);
  
  if (result && result.successCount > 0) {
    lastBreakingNewsTime = now;
    return true;
  }

  return false;
}

/**
 * Trigger topic alert when new article in popular category
 */
export async function triggerTopicAlert(
  article: IArticle,
  category: string
): Promise<boolean> {
  // Only trigger for articles with score above threshold
  if ((article.score || 0) < 70) {
    return false;
  }

  const result = await sendTopicAlert(category, article);
  
  return result !== null && result.successCount > 0;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  digestSchedule: string;
  breakingCheckSchedule: string;
  retrySchedule: string;
  lastBreakingNewsTime: number;
  cooldownActive: boolean;
} {
  const now = Date.now();
  
  return {
    digestSchedule: CONFIG.DIGEST_CRON,
    breakingCheckSchedule: CONFIG.BREAKING_CHECK_CRON,
    retrySchedule: CONFIG.RETRY_CRON,
    lastBreakingNewsTime,
    cooldownActive: now - lastBreakingNewsTime < CONFIG.BREAKING_NEWS_COOLDOWN_MS,
  };
}

/**
 * Reset cooldown (for testing/admin)
 */
export function resetCooldown(): void {
  lastBreakingNewsTime = 0;
  lastCheckedArticle = null;
  logger.info('Breaking news cooldown reset');
}

export default {
  initNotificationScheduler,
  runDailyDigestJob,
  runBreakingNewsCheck,
  triggerBreakingNewsCheck,
  triggerTopicAlert,
  getSchedulerStatus,
  resetCooldown,
};

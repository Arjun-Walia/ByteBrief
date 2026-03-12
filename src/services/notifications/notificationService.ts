/**
 * Push Notification Service
 * 
 * Core service for sending push notifications:
 * - Breaking news alerts
 * - Daily digests
 * - Topic-based notifications
 * - Notification history tracking
 */

import mongoose from 'mongoose';
import { Article, User, Notification } from '../../models';
import { IArticle } from '../../models/Article';
import { IUser } from '../../models/User';
import { INotification } from '../../models/Notification';
import { userRepository } from '../../repositories';
import { logger } from '../../utils/logger';
import { sendToDevices, sendToTopic } from './fcmClient';
import {
  NotificationType,
  PushNotificationPayload,
  NotificationData,
  BatchSendResult,
  BreakingNewsResult,
  DigestContent,
  NotificationPriority,
} from './types';

// Configuration
const CONFIG = {
  APP_SCHEME: 'bytebrief',
  WEB_BASE_URL: process.env.WEB_BASE_URL || 'https://bytebrief.app',
  BREAKING_NEWS_THRESHOLD: 85,       // Score threshold for breaking news
  MAX_DIGEST_ARTICLES: 10,
  NOTIFICATION_TTL_HOURS: 24,
};

// Keywords that indicate high importance
const BREAKING_NEWS_KEYWORDS = [
  'launches', 'announces', 'releases', 'breakthrough', 'acquired',
  'hacked', 'breach', 'vulnerability', 'zero-day', 'exploit',
  'ai', 'gpt', 'openai', 'google', 'apple', 'microsoft', 'meta',
  'outage', 'down', 'fails', 'crashes',
];

/**
 * Generate deep link for an article
 */
export function generateDeepLink(articleId: string): string {
  return `${CONFIG.APP_SCHEME}://article/${articleId}`;
}

/**
 * Generate deep link for digest
 */
export function generateDigestLink(): string {
  return `${CONFIG.APP_SCHEME}://digest`;
}

/**
 * Generate web link for an article
 */
export function generateWebLink(articleId: string): string {
  return `${CONFIG.WEB_BASE_URL}/article/${articleId}`;
}

/**
 * Determine if an article qualifies as breaking news
 */
export function detectBreakingNews(article: IArticle): BreakingNewsResult {
  const reasons: string[] = [];
  let score = article.score || 0;

  // Check title for breaking news keywords
  const titleLower = article.title.toLowerCase();
  const matchedKeywords = BREAKING_NEWS_KEYWORDS.filter(kw => 
    titleLower.includes(kw)
  );

  if (matchedKeywords.length > 0) {
    score += matchedKeywords.length * 5;
    reasons.push(`Keywords: ${matchedKeywords.join(', ')}`);
  }

  // Boost for recent articles (within 2 hours)
  const ageHours = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < 2) {
    score += 10;
    reasons.push('Very recent (< 2 hours)');
  }

  // Boost for high engagement
  if (article.viewCount > 1000) {
    score += 5;
    reasons.push(`High views: ${article.viewCount}`);
  }
  if (article.bookmarkCount > 50) {
    score += 5;
    reasons.push(`High bookmarks: ${article.bookmarkCount}`);
  }

  // Check for AI summary indicating importance
  if (article.aiSummary?.whyItMatters) {
    const importance = article.aiSummary.whyItMatters.toLowerCase();
    if (importance.includes('major') || importance.includes('significant') || 
        importance.includes('breakthrough') || importance.includes('critical')) {
      score += 10;
      reasons.push('AI flagged as important');
    }
  }

  // Boost for authoritative sources
  const authoritativeSources = ['OpenAI', 'Google', 'Microsoft', 'Apple', 'Meta'];
  if (authoritativeSources.some(s => article.sourceName.includes(s))) {
    score += 10;
    reasons.push(`Authoritative source: ${article.sourceName}`);
  }

  const isBreaking = score >= CONFIG.BREAKING_NEWS_THRESHOLD;

  return {
    isBreaking,
    article,
    score,
    reasons,
  };
}

/**
 * Build notification payload for an article
 */
export function buildArticleNotification(
  article: IArticle,
  type: NotificationType = 'breaking_news'
): PushNotificationPayload {
  // Use AI summary if available, otherwise original
  const title = article.aiSummary?.title || article.title;
  const body = article.aiSummary?.summary || article.summary;
  
  // Truncate body to fit notification constraints
  const truncatedBody = body.length > 150 
    ? body.substring(0, 147) + '...'
    : body;

  const priority: NotificationPriority = type === 'breaking_news' ? 'high' : 'normal';

  const data: NotificationData = {
    type,
    articleId: String(article._id),
    category: article.categorySlug,
    deepLink: generateDeepLink(String(article._id)),
    timestamp: new Date().toISOString(),
  };

  return {
    title,
    body: truncatedBody,
    imageUrl: article.imageUrl,
    data,
    priority,
  };
}

/**
 * Build notification payload for daily digest
 */
export function buildDigestNotification(
  articles: IArticle[],
  customTitle?: string
): PushNotificationPayload {
  const categories = [...new Set(articles.map(a => a.categorySlug))];
  const articleIds = articles.map(a => String(a._id)).join(',');
  
  const title = customTitle || `Your Daily Tech Digest`;
  const body = `${articles.length} top stories today: ${articles[0]?.title || 'Tech news'}${articles.length > 1 ? ' and more' : ''}`;

  const data: NotificationData = {
    type: 'daily_digest',
    articleIds,
    deepLink: generateDigestLink(),
    timestamp: new Date().toISOString(),
    categories: categories.join(','),
  };

  return {
    title,
    body: body.substring(0, 150),
    imageUrl: articles[0]?.imageUrl,
    data,
    priority: 'normal',
  };
}

/**
 * Get users who should receive a notification
 */
export async function getEligibleUsers(
  type: NotificationType,
  category?: string
): Promise<IUser[]> {
  const query: any = {
    isActive: true,
    'preferences.notificationsEnabled': true,
    deviceTokens: { $exists: true, $ne: [] },
  };

  // Filter by category preference for topic alerts
  if (type === 'topic_alert' && category) {
    query['preferences.categories'] = category;
  }

  const users = await User.find(query)
    .select('_id deviceTokens preferences')
    .lean();

  // Filter out users in quiet hours
  const now = new Date();

  return users.filter(user => {
    const prefs = user.preferences;
    
    // Check quiet hours
    if (prefs?.notificationTime) {
      // If user set a specific time, only send at that time for digests
      if (type === 'daily_digest') {
        const notifHour = parseInt(prefs.notificationTime.split(':')[0], 10);
        const currentHour = now.getHours();
        if (Math.abs(notifHour - currentHour) > 1) {
          return false;
        }
      }
    }

    return true;
  }) as unknown as IUser[];
}

/**
 * Send breaking news notification
 */
export async function sendBreakingNews(
  article: IArticle
): Promise<BatchSendResult | null> {
  const detection = detectBreakingNews(article);
  
  if (!detection.isBreaking) {
    logger.debug(`Article not breaking news: ${article.title}`, {
      score: detection.score,
      threshold: CONFIG.BREAKING_NEWS_THRESHOLD,
    });
    return null;
  }

  logger.info(`🚨 Breaking news detected: ${article.title}`, {
    score: detection.score,
    reasons: detection.reasons,
  });

  // Get eligible users
  const users = await getEligibleUsers('breaking_news', article.categorySlug);
  
  if (users.length === 0) {
    logger.debug('No eligible users for breaking news notification');
    return null;
  }

  // Collect all device tokens
  const allTokens = users.flatMap(u => u.deviceTokens || []);
  const uniqueTokens = [...new Set(allTokens)];

  // Build and send notification
  const payload = buildArticleNotification(article, 'breaking_news');
  const result = await sendToDevices(uniqueTokens, payload);

  // Record notification in database
  await recordNotification({
    type: 'breaking_news',
    title: payload.title,
    body: payload.body,
    data: payload.data as unknown as Record<string, string>,
    articleIds: [article._id as mongoose.Types.ObjectId],
    deviceTokens: uniqueTokens,
    status: result.successCount > 0 ? 'sent' : 'failed',
    sentAt: new Date(),
    successCount: result.successCount,
    failureCount: result.failureCount,
  });

  // Clean up invalid tokens
  if (result.invalidTokens.length > 0) {
    await cleanupInvalidTokens(result.invalidTokens);
  }

  return result;
}

/**
 * Send daily digest to all eligible users
 */
export async function sendDailyDigest(): Promise<BatchSendResult> {
  logger.info('📰 Preparing daily digest notifications...');

  // Get top articles from last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const topArticles = await Article.find({
    publishedAt: { $gte: yesterday },
    aiSummary: { $exists: true },
  })
    .sort({ score: -1 })
    .limit(CONFIG.MAX_DIGEST_ARTICLES)
    .lean() as unknown as IArticle[];

  if (topArticles.length === 0) {
    logger.warn('No articles available for daily digest');
    return {
      total: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      results: [],
    };
  }

  // Get eligible users
  const users = await getEligibleUsers('daily_digest');
  
  if (users.length === 0) {
    logger.debug('No eligible users for daily digest');
    return {
      total: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      results: [],
    };
  }

  // Collect all device tokens
  const allTokens = users.flatMap(u => u.deviceTokens || []);
  const uniqueTokens = [...new Set(allTokens)];

  logger.info(`Sending daily digest to ${uniqueTokens.length} devices`, {
    articleCount: topArticles.length,
    userCount: users.length,
  });

  // Build and send notification
  const payload = buildDigestNotification(topArticles);
  const result = await sendToDevices(uniqueTokens, payload);

  // Record notification
  await recordNotification({
    type: 'daily_digest',
    title: payload.title,
    body: payload.body,
    data: payload.data as unknown as Record<string, string>,
    articleIds: topArticles.map(a => a._id as mongoose.Types.ObjectId),
    deviceTokens: uniqueTokens,
    status: result.successCount > 0 ? 'sent' : 'failed',
    sentAt: new Date(),
    successCount: result.successCount,
    failureCount: result.failureCount,
  });

  // Clean up invalid tokens
  if (result.invalidTokens.length > 0) {
    await cleanupInvalidTokens(result.invalidTokens);
  }

  logger.info(`Daily digest sent`, {
    success: result.successCount,
    failure: result.failureCount,
    invalidTokens: result.invalidTokens.length,
  });

  return result;
}

/**
 * Send topic alert for a specific category
 */
export async function sendTopicAlert(
  category: string,
  article: IArticle
): Promise<BatchSendResult | null> {
  // Get users interested in this category
  const users = await getEligibleUsers('topic_alert', category);
  
  if (users.length === 0) {
    return null;
  }

  const allTokens = users.flatMap(u => u.deviceTokens || []);
  const uniqueTokens = [...new Set(allTokens)];

  const payload = buildArticleNotification(article, 'topic_alert');
  const result = await sendToDevices(uniqueTokens, payload);

  // Record notification
  await recordNotification({
    type: 'topic_alert',
    title: payload.title,
    body: payload.body,
    data: payload.data as unknown as Record<string, string>,
    articleIds: [article._id as mongoose.Types.ObjectId],
    deviceTokens: uniqueTokens,
    status: result.successCount > 0 ? 'sent' : 'failed',
    sentAt: new Date(),
    successCount: result.successCount,
    failureCount: result.failureCount,
  });

  if (result.invalidTokens.length > 0) {
    await cleanupInvalidTokens(result.invalidTokens);
  }

  return result;
}

/**
 * Send notification to a specific user
 */
export async function sendToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<BatchSendResult | null> {
  const user = await User.findById(userId)
    .select('deviceTokens preferences')
    .lean();

  if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
    logger.debug(`User ${userId} has no device tokens`);
    return null;
  }

  if (!user.preferences?.notificationsEnabled) {
    logger.debug(`User ${userId} has notifications disabled`);
    return null;
  }

  const result = await sendToDevices(user.deviceTokens, payload);

  if (result.invalidTokens.length > 0) {
    await cleanupInvalidTokens(result.invalidTokens, userId);
  }

  return result;
}

/**
 * Record notification in database for history
 */
async function recordNotification(
  data: Partial<INotification>
): Promise<INotification> {
  const notification = new Notification(data);
  await notification.save();
  return notification;
}

/**
 * Remove invalid tokens from users
 */
async function cleanupInvalidTokens(
  tokens: string[],
  userId?: string
): Promise<void> {
  if (tokens.length === 0) return;

  logger.info(`Cleaning up ${tokens.length} invalid device tokens`);

  if (userId) {
    // Remove from specific user
    await User.findByIdAndUpdate(userId, {
      $pullAll: { deviceTokens: tokens },
    });
  } else {
    // Remove from all users
    await User.updateMany(
      { deviceTokens: { $in: tokens } },
      { $pullAll: { deviceTokens: tokens } }
    );
  }
}

/**
 * Get notification statistics
 */
export async function getNotificationStats(
  startDate: Date,
  endDate: Date
): Promise<{
  total: number;
  byType: Record<NotificationType, number>;
  byStatus: Record<string, number>;
  totalSuccess: number;
  totalFailure: number;
}> {
  const notifications = await Notification.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byType: {
          $push: '$type',
        },
        byStatus: {
          $push: '$status',
        },
        totalSuccess: { $sum: '$successCount' },
        totalFailure: { $sum: '$failureCount' },
      },
    },
  ]);

  if (notifications.length === 0) {
    return {
      total: 0,
      byType: {} as Record<NotificationType, number>,
      byStatus: {},
      totalSuccess: 0,
      totalFailure: 0,
    };
  }

  const result = notifications[0];
  
  // Count by type
  const byType = result.byType.reduce((acc: Record<string, number>, type: string) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Count by status
  const byStatus = result.byStatus.reduce((acc: Record<string, number>, status: string) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    total: result.total,
    byType,
    byStatus,
    totalSuccess: result.totalSuccess,
    totalFailure: result.totalFailure,
  };
}

/**
 * Retry failed notifications
 */
export async function retryFailedNotifications(): Promise<number> {
  const failedNotifications = await Notification.find({
    status: 'failed',
    createdAt: { $gte: new Date(Date.now() - CONFIG.NOTIFICATION_TTL_HOURS * 60 * 60 * 1000) },
  }).limit(50);

  logger.info(`Found ${failedNotifications.length} failed notifications to retry`);

  let retryCount = 0;

  for (const notification of failedNotifications) {
    // Extract data from Map or plain object
    const notifData = notification.data as Map<string, string> | Record<string, string> | undefined;
    const getDataValue = (key: string): string | undefined => {
      if (!notifData) return undefined;
      if (notifData instanceof Map) return notifData.get(key);
      return (notifData as Record<string, string>)[key];
    };

    const payload: PushNotificationPayload = {
      title: notification.title,
      body: notification.body,
      data: {
        type: notification.type,
        deepLink: getDataValue('deepLink') || generateDigestLink(),
        timestamp: new Date().toISOString(),
        articleId: getDataValue('articleId'),
      },
      priority: notification.type === 'breaking_news' ? 'high' : 'normal',
    };

    // Filter out already invalidated tokens
    const validTokens = notification.deviceTokens.filter(t => t && t.length > 0);
    
    if (validTokens.length === 0) {
      notification.status = 'failed';
      notification.errorMessage = 'No valid tokens remaining';
      await notification.save();
      continue;
    }

    const result = await sendToDevices(validTokens, payload);

    notification.successCount += result.successCount;
    notification.failureCount += result.failureCount;
    notification.status = result.successCount > 0 ? 'sent' : 'failed';
    notification.sentAt = new Date();
    
    // Remove invalid tokens from the notification record
    notification.deviceTokens = validTokens.filter(
      t => !result.invalidTokens.includes(t)
    );
    
    await notification.save();

    if (result.invalidTokens.length > 0) {
      await cleanupInvalidTokens(result.invalidTokens);
    }

    retryCount++;
  }

  logger.info(`Retried ${retryCount} notifications`);
  return retryCount;
}

export default {
  generateDeepLink,
  generateDigestLink,
  generateWebLink,
  detectBreakingNews,
  buildArticleNotification,
  buildDigestNotification,
  getEligibleUsers,
  sendBreakingNews,
  sendDailyDigest,
  sendTopicAlert,
  sendToUser,
  getNotificationStats,
  retryFailedNotifications,
};

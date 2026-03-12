/**
 * Push Notification Type Definitions
 * 
 * Types for Firebase Cloud Messaging integration.
 */

import { IArticle } from '../../models/Article';

/**
 * Notification types supported by the service
 */
export type NotificationType = 
  | 'breaking_news'    // Important tech story detected
  | 'daily_digest'     // Daily news summary
  | 'topic_alert'      // Category-specific update
  | 'system';          // System notifications

/**
 * Notification priority levels
 */
export type NotificationPriority = 'high' | 'normal' | 'low';

/**
 * Push notification payload structure
 */
export interface PushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data: NotificationData;
  priority: NotificationPriority;
}

/**
 * Deep link data included in notifications
 */
export interface NotificationData {
  type: NotificationType;
  articleId?: string;
  articleIds?: string;      // Comma-separated for digest
  category?: string;
  deepLink: string;         // bytebrief://article/{id} or bytebrief://digest
  timestamp: string;
  [key: string]: string | undefined;
}

/**
 * Result of a single notification send attempt
 */
export interface SendResult {
  token: string;
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  shouldInvalidate?: boolean;  // True if token is invalid and should be removed
}

/**
 * Batch send results
 */
export interface BatchSendResult {
  total: number;
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  results: SendResult[];
}

/**
 * Breaking news detection result
 */
export interface BreakingNewsResult {
  isBreaking: boolean;
  article: IArticle;
  score: number;
  reasons: string[];
}

/**
 * Daily digest content
 */
export interface DigestContent {
  articles: IArticle[];
  summary: string;
  categories: string[];
  date: Date;
}

/**
 * Notification job configuration
 */
export interface NotificationJobConfig {
  maxTokensPerBatch: number;
  retryAttempts: number;
  retryDelayMs: number;
  rateLimitPerMinute: number;
  digestHour: number;  // Hour to send daily digest (0-23)
}

/**
 * Rate limiter state
 */
export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number;  // Tokens per second
}

/**
 * Notification queue item
 */
export interface NotificationQueueItem {
  id: string;
  userId: string;
  payload: PushNotificationPayload;
  deviceTokens: string[];
  attempts: number;
  scheduledAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

/**
 * User notification preferences
 */
export interface UserNotificationPrefs {
  enabled: boolean;
  breakingNews: boolean;
  dailyDigest: boolean;
  topicAlerts: string[];  // Category slugs
  quietHoursStart?: string;  // HH:MM
  quietHoursEnd?: string;
}

/**
 * FCM message options for Android/iOS
 */
export interface FCMPlatformConfig {
  android: {
    priority: 'high' | 'normal';
    ttl: number;
    notification: {
      channelId: string;
      icon?: string;
      color?: string;
      sound?: string;
    };
  };
  apns: {
    headers: {
      'apns-priority': string;
      'apns-push-type': string;
    };
    payload: {
      aps: {
        alert: {
          title: string;
          body: string;
        };
        badge?: number;
        sound?: string;
        'content-available'?: number;
      };
    };
  };
}

/**
 * Notification statistics
 */
export interface NotificationStats {
  sent: number;
  delivered: number;
  failed: number;
  invalidTokens: number;
  byType: Record<NotificationType, number>;
  byHour: Record<number, number>;
}

export default {
  NotificationType: 'NotificationType',
  NotificationPriority: 'NotificationPriority',
};

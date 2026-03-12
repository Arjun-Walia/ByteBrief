/**
 * Push Notification Service
 * 
 * Firebase Cloud Messaging integration for ByteBrief.
 * 
 * Features:
 * - Breaking news detection and alerts
 * - Daily digest notifications
 * - Topic-based notifications
 * - Device token management
 * - Retry logic with exponential backoff
 * - Rate limiting (token bucket)
 * - Invalid token cleanup
 * 
 * Usage:
 * ```typescript
 * import { 
 *   initNotificationScheduler,
 *   sendBreakingNews,
 *   sendDailyDigest 
 * } from './services/notifications';
 * 
 * // Initialize on app start
 * initNotificationScheduler();
 * 
 * // Manual triggers
 * await sendBreakingNews(article);
 * await sendDailyDigest();
 * ```
 */

// Core notification service
export {
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
} from './notificationService';

// FCM client
export {
  sendToDevice,
  sendToDevices,
  sendToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
  getRateLimiterStatus,
} from './fcmClient';

// Scheduler
export {
  initNotificationScheduler,
  runDailyDigestJob,
  runBreakingNewsCheck,
  triggerBreakingNewsCheck,
  triggerTopicAlert,
  getSchedulerStatus,
  resetCooldown,
} from './scheduler';

// Types
export * from './types';

// Default export with common functions
import notificationService from './notificationService';
import fcmClient from './fcmClient';
import scheduler from './scheduler';

export default {
  ...notificationService,
  ...fcmClient,
  ...scheduler,
};

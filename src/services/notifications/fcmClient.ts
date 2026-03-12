/**
 * Firebase Cloud Messaging Client
 * 
 * Handles FCM communication with:
 * - Retry logic with exponential backoff
 * - Rate limiting (token bucket algorithm)
 * - Batch sending optimization
 * - Invalid token detection
 */

import admin from 'firebase-admin';
import { getFirebaseMessaging } from '../../config/firebase';
import { logger } from '../../utils/logger';
import {
  PushNotificationPayload,
  SendResult,
  BatchSendResult,
  RateLimiterState,
  FCMPlatformConfig,
  NotificationPriority,
} from './types';

// Configuration
const CONFIG = {
  MAX_BATCH_SIZE: 500,        // FCM limit
  RETRY_ATTEMPTS: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  RATE_LIMIT_PER_MINUTE: 500,
  TOKEN_REFILL_RATE: 8.33,    // ~500 per minute
};

// Rate limiter state
const rateLimiter: RateLimiterState = {
  tokens: CONFIG.RATE_LIMIT_PER_MINUTE,
  lastRefill: Date.now(),
  maxTokens: CONFIG.RATE_LIMIT_PER_MINUTE,
  refillRate: CONFIG.TOKEN_REFILL_RATE,
};

/**
 * Error codes that indicate an invalid token
 */
const INVALID_TOKEN_ERRORS = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
];

/**
 * Error codes that indicate a retryable error
 */
const RETRYABLE_ERRORS = [
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/quota-exceeded',
  'messaging/device-message-rate-exceeded',
];

/**
 * Refill rate limiter tokens based on elapsed time
 */
function refillTokens(): void {
  const now = Date.now();
  const elapsed = (now - rateLimiter.lastRefill) / 1000;
  const newTokens = elapsed * rateLimiter.refillRate;
  
  rateLimiter.tokens = Math.min(
    rateLimiter.maxTokens,
    rateLimiter.tokens + newTokens
  );
  rateLimiter.lastRefill = now;
}

/**
 * Wait for rate limit tokens to become available
 */
async function waitForRateLimit(count: number): Promise<void> {
  refillTokens();
  
  if (rateLimiter.tokens >= count) {
    rateLimiter.tokens -= count;
    return;
  }
  
  // Calculate wait time
  const tokensNeeded = count - rateLimiter.tokens;
  const waitMs = (tokensNeeded / rateLimiter.refillRate) * 1000;
  
  logger.debug(`Rate limit: waiting ${Math.ceil(waitMs)}ms for ${count} tokens`);
  await sleep(waitMs);
  
  refillTokens();
  rateLimiter.tokens = Math.max(0, rateLimiter.tokens - count);
}

/**
 * Build platform-specific FCM message configuration
 */
function buildPlatformConfig(
  payload: PushNotificationPayload
): Partial<FCMPlatformConfig> {
  const priority = payload.priority === 'high' ? 'high' : 'normal';
  
  return {
    android: {
      priority,
      ttl: 86400000, // 24 hours
      notification: {
        channelId: getChannelId(payload.data.type as string),
        icon: 'ic_notification',
        color: '#4F46E5',
        sound: priority === 'high' ? 'default' : undefined,
      },
    },
    apns: {
      headers: {
        'apns-priority': priority === 'high' ? '10' : '5',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body,
          },
          sound: priority === 'high' ? 'default' : undefined,
          'content-available': 1,
        },
      },
    },
  };
}

/**
 * Get Android notification channel ID based on notification type
 */
function getChannelId(type: string): string {
  switch (type) {
    case 'breaking_news':
      return 'breaking_news_channel';
    case 'daily_digest':
      return 'digest_channel';
    case 'topic_alert':
      return 'topic_alert_channel';
    default:
      return 'default_channel';
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(attempt: number): number {
  const delay = CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, CONFIG.MAX_RETRY_DELAY_MS);
}

/**
 * Send notification to a single device with retry logic
 */
export async function sendToDevice(
  token: string,
  payload: PushNotificationPayload
): Promise<SendResult> {
  const messaging = getFirebaseMessaging();
  
  if (!messaging) {
    return {
      token,
      success: false,
      error: 'Firebase not initialized',
      errorCode: 'firebase/not-initialized',
    };
  }

  // Wait for rate limit
  await waitForRateLimit(1);

  const message: admin.messaging.Message = {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
    },
    data: Object.fromEntries(
      Object.entries(payload.data).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>,
    ...buildPlatformConfig(payload),
  };

  for (let attempt = 0; attempt < CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      const messageId = await messaging.send(message);
      
      logger.debug(`Notification sent to ${token.substring(0, 20)}...`, {
        messageId,
        type: payload.data.type,
      });
      
      return {
        token,
        success: true,
        messageId,
      };
    } catch (error: any) {
      const errorCode = error.code || 'unknown';
      
      // Check if token is invalid
      if (INVALID_TOKEN_ERRORS.includes(errorCode)) {
        logger.warn(`Invalid token detected: ${token.substring(0, 20)}...`, {
          errorCode,
        });
        
        return {
          token,
          success: false,
          error: error.message,
          errorCode,
          shouldInvalidate: true,
        };
      }
      
      // Check if error is retryable
      if (RETRYABLE_ERRORS.includes(errorCode) && attempt < CONFIG.RETRY_ATTEMPTS - 1) {
        const delay = getRetryDelay(attempt);
        logger.debug(`Retrying notification (attempt ${attempt + 1}), waiting ${delay}ms`);
        await sleep(delay);
        continue;
      }
      
      // Non-retryable error or max retries reached
      logger.error(`Failed to send notification: ${error.message}`, {
        token: token.substring(0, 20),
        errorCode,
        attempt,
      });
      
      return {
        token,
        success: false,
        error: error.message,
        errorCode,
      };
    }
  }

  return {
    token,
    success: false,
    error: 'Max retries exceeded',
  };
}

/**
 * Send notification to multiple devices in batches
 */
export async function sendToDevices(
  tokens: string[],
  payload: PushNotificationPayload
): Promise<BatchSendResult> {
  const messaging = getFirebaseMessaging();
  
  if (!messaging) {
    return {
      total: tokens.length,
      successCount: 0,
      failureCount: tokens.length,
      invalidTokens: [],
      results: tokens.map(token => ({
        token,
        success: false,
        error: 'Firebase not initialized',
      })),
    };
  }

  if (tokens.length === 0) {
    return {
      total: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      results: [],
    };
  }

  logger.info(`Sending notification to ${tokens.length} devices`, {
    type: payload.data.type,
    title: payload.title,
  });

  const results: SendResult[] = [];
  const invalidTokens: string[] = [];

  // Process in batches
  for (let i = 0; i < tokens.length; i += CONFIG.MAX_BATCH_SIZE) {
    const batchTokens = tokens.slice(i, i + CONFIG.MAX_BATCH_SIZE);
    
    // Wait for rate limit
    await waitForRateLimit(batchTokens.length);

    const messages: admin.messaging.Message[] = batchTokens.map(token => ({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: Object.fromEntries(
        Object.entries(payload.data).filter(([_, v]) => v !== undefined)
      ) as Record<string, string>,
      ...buildPlatformConfig(payload),
    }));

    try {
      const response = await messaging.sendEach(messages);
      
      response.responses.forEach((resp, index) => {
        const token = batchTokens[index];
        
        if (resp.success) {
          results.push({
            token,
            success: true,
            messageId: resp.messageId,
          });
        } else {
          const errorCode = resp.error?.code || 'unknown';
          const shouldInvalidate = INVALID_TOKEN_ERRORS.includes(errorCode);
          
          if (shouldInvalidate) {
            invalidTokens.push(token);
          }
          
          results.push({
            token,
            success: false,
            error: resp.error?.message,
            errorCode,
            shouldInvalidate,
          });
        }
      });
      
      logger.debug(`Batch sent: ${response.successCount}/${batchTokens.length} successful`);
    } catch (error: any) {
      // Batch send failed entirely - retry individual messages
      logger.warn(`Batch send failed, retrying individually: ${error.message}`);
      
      for (const token of batchTokens) {
        const result = await sendToDevice(token, payload);
        results.push(result);
        if (result.shouldInvalidate) {
          invalidTokens.push(token);
        }
      }
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  logger.info(`Notification batch complete`, {
    total: tokens.length,
    successCount,
    failureCount,
    invalidTokens: invalidTokens.length,
  });

  return {
    total: tokens.length,
    successCount,
    failureCount,
    invalidTokens,
    results,
  };
}

/**
 * Send notification to a topic
 */
export async function sendToTopic(
  topic: string,
  payload: PushNotificationPayload
): Promise<SendResult> {
  const messaging = getFirebaseMessaging();
  
  if (!messaging) {
    return {
      token: `topic:${topic}`,
      success: false,
      error: 'Firebase not initialized',
    };
  }

  await waitForRateLimit(1);

  const message: admin.messaging.Message = {
    topic,
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
    },
    data: Object.fromEntries(
      Object.entries(payload.data).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>,
    ...buildPlatformConfig(payload),
  };

  try {
    const messageId = await messaging.send(message);
    
    logger.info(`Topic notification sent`, { topic, messageId });
    
    return {
      token: `topic:${topic}`,
      success: true,
      messageId,
    };
  } catch (error: any) {
    logger.error(`Failed to send topic notification: ${error.message}`, { topic });
    
    return {
      token: `topic:${topic}`,
      success: false,
      error: error.message,
      errorCode: error.code,
    };
  }
}

/**
 * Subscribe tokens to a topic
 */
export async function subscribeToTopic(
  tokens: string[],
  topic: string
): Promise<{ successCount: number; failureCount: number }> {
  const messaging = getFirebaseMessaging();
  
  if (!messaging || tokens.length === 0) {
    return { successCount: 0, failureCount: tokens.length };
  }

  try {
    const response = await messaging.subscribeToTopic(tokens, topic);
    
    logger.debug(`Subscribed ${response.successCount} devices to topic: ${topic}`);
    
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    logger.error(`Failed to subscribe to topic: ${error.message}`, { topic });
    return { successCount: 0, failureCount: tokens.length };
  }
}

/**
 * Unsubscribe tokens from a topic
 */
export async function unsubscribeFromTopic(
  tokens: string[],
  topic: string
): Promise<{ successCount: number; failureCount: number }> {
  const messaging = getFirebaseMessaging();
  
  if (!messaging || tokens.length === 0) {
    return { successCount: 0, failureCount: tokens.length };
  }

  try {
    const response = await messaging.unsubscribeFromTopic(tokens, topic);
    
    logger.debug(`Unsubscribed ${response.successCount} devices from topic: ${topic}`);
    
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    logger.error(`Failed to unsubscribe from topic: ${error.message}`, { topic });
    return { successCount: 0, failureCount: tokens.length };
  }
}

/**
 * Get current rate limiter status
 */
export function getRateLimiterStatus(): RateLimiterState {
  refillTokens();
  return { ...rateLimiter };
}

export default {
  sendToDevice,
  sendToDevices,
  sendToTopic,
  subscribeToTopic,
  unsubscribeFromTopic,
  getRateLimiterStatus,
};

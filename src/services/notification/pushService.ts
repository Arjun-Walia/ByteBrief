import { getFirebaseMessaging } from '../../config/firebase';
import { User, Article, Notification } from '../../models';
import { rankingService } from '../ranking/ranker';
import { logger } from '../../utils/logger';

export class PushService {
  private messaging = getFirebaseMessaging();

  async sendToDevice(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<boolean> {
    if (!this.messaging) {
      logger.warn('Firebase messaging not configured');
      return false;
    }

    try {
      await this.messaging.send({
        token,
        notification: {
          title,
          body,
        },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'bytebrief_news',
          },
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: 'default',
            },
          },
        },
      });
      return true;
    } catch (error) {
      logger.error('Failed to send push notification:', error);
      return false;
    }
  }

  async sendToMultipleDevices(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{ success: number; failure: number }> {
    if (!this.messaging || tokens.length === 0) {
      return { success: 0, failure: tokens.length };
    }

    try {
      const response = await this.messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body,
        },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'bytebrief_news',
          },
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: 'default',
            },
          },
        },
      });

      return {
        success: response.successCount,
        failure: response.failureCount,
      };
    } catch (error) {
      logger.error('Failed to send multicast notification:', error);
      return { success: 0, failure: tokens.length };
    }
  }

  async sendDailyDigest(): Promise<void> {
    // Get users with notifications enabled
    const users = await User.find({
      'preferences.notificationsEnabled': true,
      deviceTokens: { $exists: true, $not: { $size: 0 } },
    });

    if (users.length === 0) {
      logger.info('No users to send daily digest to');
      return;
    }

    // Get top articles
    const topArticles = await rankingService.getTopArticles(5);
    if (topArticles.length === 0) {
      logger.info('No articles for daily digest');
      return;
    }

    const featuredArticle = topArticles[0] as unknown as { title: string; _id: { toString(): string } };
    const title = '📰 Your Daily Tech Brief';
    const body = featuredArticle.title;
    const data = {
      type: 'daily_digest',
      articleId: featuredArticle._id.toString(),
    };

    // Collect all device tokens
    const allTokens = users.flatMap(user => user.deviceTokens);
    const uniqueTokens = [...new Set(allTokens)];

    // Send notifications in batches of 500
    const batchSize = 500;
    let totalSuccess = 0;
    let totalFailure = 0;

    for (let i = 0; i < uniqueTokens.length; i += batchSize) {
      const batch = uniqueTokens.slice(i, i + batchSize);
      const result = await this.sendToMultipleDevices(batch, title, body, data);
      totalSuccess += result.success;
      totalFailure += result.failure;
    }

    // Log notification
    await Notification.create({
      type: 'daily_digest',
      title,
      body,
      data,
      articleIds: topArticles.map(a => (a as unknown as { _id: unknown })._id),
      sentAt: new Date(),
      status: totalSuccess > 0 ? 'sent' : 'failed',
      deviceTokens: uniqueTokens,
      successCount: totalSuccess,
      failureCount: totalFailure,
    });

    logger.info(`Daily digest sent: ${totalSuccess} success, ${totalFailure} failed`);
  }

  async sendBreakingNews(articleId: string): Promise<void> {
    const article = await Article.findById(articleId);
    if (!article) {
      logger.error(`Article ${articleId} not found for breaking news`);
      return;
    }

    const users = await User.find({
      'preferences.notificationsEnabled': true,
      deviceTokens: { $exists: true, $not: { $size: 0 } },
    });

    const allTokens = users.flatMap(user => user.deviceTokens);
    const uniqueTokens = [...new Set(allTokens)];

    const title = '🚨 Breaking Tech News';
    const body = article.title;
    const data = {
      type: 'breaking_news',
      articleId: article._id.toString(),
    };

    const result = await this.sendToMultipleDevices(uniqueTokens, title, body, data);

    await Notification.create({
      type: 'breaking_news',
      title,
      body,
      data,
      articleIds: [article._id],
      sentAt: new Date(),
      status: result.success > 0 ? 'sent' : 'failed',
      deviceTokens: uniqueTokens,
      successCount: result.success,
      failureCount: result.failure,
    });

    logger.info(`Breaking news sent: ${result.success} success, ${result.failure} failed`);
  }
}

export const pushService = new PushService();

export default pushService;

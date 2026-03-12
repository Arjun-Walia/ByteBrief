/**
 * Notification Routes
 * 
 * Admin endpoints for notification management.
 */

import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireAdmin } from '../../middleware/auth';
import {
  sendDailyDigest,
  sendBreakingNews,
  getNotificationStats,
  retryFailedNotifications,
  getSchedulerStatus,
  resetCooldown,
  getRateLimiterStatus,
} from '../../services/notifications';
import { Article, Notification } from '../../models';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * All notification admin routes require authentication
 */
router.use(authenticate);

/**
 * @route   POST /api/v1/notifications/send-digest
 * @desc    Manually trigger daily digest (admin only)
 * @access  Private/Admin
 */
router.post('/send-digest', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    logger.info('Manual daily digest triggered by admin', {
      userId: req.user?.id,
    });
    
    const result = await sendDailyDigest();
    
    res.json({
      success: true,
      message: 'Daily digest sent',
      data: {
        total: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
        invalidTokens: result.invalidTokens.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/notifications/send-breaking/:articleId
 * @desc    Send breaking news for specific article (admin only)
 * @access  Private/Admin
 */
router.post('/send-breaking/:articleId', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { articleId } = req.params;
    
    const article = await Article.findById(articleId).lean();
    
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }
    
    logger.info('Manual breaking news triggered by admin', {
      userId: req.user?.id,
      articleId,
    });
    
    const result = await sendBreakingNews(article as any);
    
    if (!result) {
      return res.status(400).json({
        success: false,
        message: 'Article does not qualify as breaking news',
      });
    }
    
    res.json({
      success: true,
      message: 'Breaking news notification sent',
      data: {
        total: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/notifications/retry-failed
 * @desc    Retry failed notifications (admin only)
 * @access  Private/Admin
 */
router.post('/retry-failed', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    logger.info('Manual notification retry triggered by admin', {
      userId: req.user?.id,
    });
    
    const retryCount = await retryFailedNotifications();
    
    res.json({
      success: true,
      message: `Retried ${retryCount} notifications`,
      data: { retryCount },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/notifications/stats
 * @desc    Get notification statistics (admin only)
 * @access  Private/Admin
 */
router.get('/stats', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate 
      ? new Date(startDate as string)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    const end = endDate
      ? new Date(endDate as string)
      : new Date();
    
    const stats = await getNotificationStats(start, end);
    
    res.json({
      success: true,
      data: {
        period: { start, end },
        ...stats,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/notifications/scheduler-status
 * @desc    Get scheduler status (admin only)
 * @access  Private/Admin
 */
router.get('/scheduler-status', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const schedulerStatus = getSchedulerStatus();
    const rateLimiterStatus = getRateLimiterStatus();
    
    res.json({
      success: true,
      data: {
        scheduler: schedulerStatus,
        rateLimiter: rateLimiterStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/notifications/reset-cooldown
 * @desc    Reset breaking news cooldown (admin only)
 * @access  Private/Admin
 */
router.post('/reset-cooldown', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    resetCooldown();
    
    logger.info('Breaking news cooldown reset by admin', {
      userId: req.user?.id,
    });
    
    res.json({
      success: true,
      message: 'Cooldown reset successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/notifications/history
 * @desc    Get notification history (admin only)
 * @access  Private/Admin
 */
router.get('/history', requireAdmin, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    
    const query: any = {};
    if (type) query.type = type;
    if (status) query.status = status;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-deviceTokens')
        .populate('articleIds', 'title')
        .lean(),
      Notification.countDocuments(query),
    ]);
    
    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

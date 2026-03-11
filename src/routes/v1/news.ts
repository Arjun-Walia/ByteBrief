import { Router } from 'express';
import newsController from '../../controllers/newsController';
import { validate, getTodayArticlesSchema, getArticlesByCategorySchema, searchArticlesSchema } from '../../validation';

const router = Router();

/**
 * @route   GET /api/v1/news/today
 * @desc    Get today's top news articles
 * @access  Public
 */
router.get('/today', validate(getTodayArticlesSchema), newsController.getTodayNews);

/**
 * @route   GET /api/v1/news/top
 * @desc    Get top ranked articles
 * @access  Public
 */
router.get('/top', newsController.getTopNews);

/**
 * @route   GET /api/v1/news/search
 * @desc    Search news articles
 * @access  Public
 */
router.get('/search', validate(searchArticlesSchema), newsController.searchNews);

/**
 * @route   GET /api/v1/news/category/:category
 * @desc    Get news articles by category slug
 * @access  Public
 */
router.get(
  '/category/:category',
  validate(getArticlesByCategorySchema),
  newsController.getNewsByCategory
);

export default router;

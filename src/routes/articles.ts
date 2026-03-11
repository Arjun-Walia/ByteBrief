import { Router } from 'express';
import {
  getArticles,
  getTopArticles,
  getArticleById,
  getArticlesByCategory,
  searchArticles,
} from '../controllers/articleController';

const router = Router();

// GET /api/articles - Get paginated articles
router.get('/', getArticles);

// GET /api/articles/top - Get top ranked articles
router.get('/top', getTopArticles);

// GET /api/articles/search - Search articles
router.get('/search', searchArticles);

// GET /api/articles/category/:slug - Get articles by category
router.get('/category/:slug', getArticlesByCategory);

// GET /api/articles/:id - Get article by ID
router.get('/:id', getArticleById);

export default router;

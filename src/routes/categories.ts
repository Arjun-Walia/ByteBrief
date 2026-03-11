import { Router } from 'express';
import { getCategories, getCategoryBySlug } from '../controllers/categoryController';

const router = Router();

// GET /api/categories - Get all categories
router.get('/', getCategories);

// GET /api/categories/:slug - Get category by slug
router.get('/:slug', getCategoryBySlug);

export default router;

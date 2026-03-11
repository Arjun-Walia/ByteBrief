import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  updatePreferences,
  getBookmarks,
  addBookmark,
  removeBookmark,
} from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

// POST /api/users/register - Register new user
router.post('/register', authLimiter, register);

// POST /api/users/login - Login
router.post('/login', authLimiter, login);

// GET /api/users/profile - Get user profile (protected)
router.get('/profile', authenticate, getProfile);

// PUT /api/users/preferences - Update preferences (protected)
router.put('/preferences', authenticate, updatePreferences);

// GET /api/users/bookmarks - Get user bookmarks (protected)
router.get('/bookmarks', authenticate, getBookmarks);

// POST /api/users/bookmarks/:articleId - Add bookmark (protected)
router.post('/bookmarks/:articleId', authenticate, addBookmark);

// DELETE /api/users/bookmarks/:articleId - Remove bookmark (protected)
router.delete('/bookmarks/:articleId', authenticate, removeBookmark);

export default router;

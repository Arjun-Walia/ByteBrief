import { Router } from 'express';
import bookmarkController from '../../controllers/bookmarkController';
import { authenticate } from '../../middleware/auth';
import {
  validate,
  getBookmarksSchema,
  createBookmarkSchema,
  toggleBookmarkSchema,
  updateBookmarkSchema,
  deleteBookmarkSchema,
} from '../../validation';

const router = Router();

/**
 * All bookmark routes require authentication
 */
router.use(authenticate);

/**
 * @route   GET /api/v1/bookmarks
 * @desc    Get user's bookmarks with pagination
 * @access  Private
 */
router.get('/', validate(getBookmarksSchema), bookmarkController.getBookmarks);

/**
 * @route   GET /api/v1/bookmarks/folders
 * @desc    Get user's bookmark folders
 * @access  Private
 */
router.get('/folders', bookmarkController.getFolders);

/**
 * @route   GET /api/v1/bookmarks/check/:articleId
 * @desc    Check if an article is bookmarked
 * @access  Private
 */
router.get('/check/:articleId', bookmarkController.checkBookmarked);

/**
 * @route   POST /api/v1/bookmarks
 * @desc    Create a new bookmark
 * @access  Private
 */
router.post('/', validate(createBookmarkSchema), bookmarkController.createBookmark);

/**
 * @route   POST /api/v1/bookmarks/toggle
 * @desc    Toggle bookmark (add/remove)
 * @access  Private
 */
router.post('/toggle', validate(toggleBookmarkSchema), bookmarkController.toggleBookmark);

/**
 * @route   GET /api/v1/bookmarks/:id
 * @desc    Get a specific bookmark
 * @access  Private
 */
router.get('/:id', bookmarkController.getBookmark);

/**
 * @route   PATCH /api/v1/bookmarks/:id
 * @desc    Update a bookmark
 * @access  Private
 */
router.patch('/:id', validate(updateBookmarkSchema), bookmarkController.updateBookmark);

/**
 * @route   DELETE /api/v1/bookmarks/:id
 * @desc    Delete a bookmark
 * @access  Private
 */
router.delete('/:id', validate(deleteBookmarkSchema), bookmarkController.deleteBookmark);

export default router;

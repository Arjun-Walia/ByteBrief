import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { bookmarkRepository } from '../repositories';

/**
 * Transform bookmark to DTO
 */
function toBookmarkDTO(bookmark: any) {
  return {
    id: bookmark._id,
    article: bookmark.article
      ? {
          id: bookmark.article._id,
          title: bookmark.article.title,
          summary: bookmark.article.summary,
          source: bookmark.article.source,
          imageUrl: bookmark.article.imageUrl,
          category: bookmark.article.category,
          readTime: bookmark.article.readTime,
          publishedAt: bookmark.article.publishedAt,
        }
      : null,
    folder: bookmark.folder,
    notes: bookmark.notes,
    createdAt: bookmark.createdAt,
  };
}

/**
 * GET /api/v1/bookmarks
 * Get user's bookmarks with pagination
 */
export async function getBookmarks(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const folder = req.query.folder as string | undefined;

    const result = await bookmarkRepository.findByUser(userId, page, limit, { folder });

    res.json({
      success: true,
      data: {
        bookmarks: result.bookmarks.map(toBookmarkDTO),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/bookmarks
 * Create a new bookmark
 */
export async function createBookmark(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { articleId, folder, notes } = req.body;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        message: 'Article ID is required',
      });
    }

    // Check if already bookmarked
    const exists = await bookmarkRepository.isBookmarked(userId, articleId);
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Article already bookmarked',
      });
    }

    const bookmark = await bookmarkRepository.create(userId, articleId, folder, notes);

    res.status(201).json({
      success: true,
      message: 'Bookmark created successfully',
      data: toBookmarkDTO(bookmark),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/bookmarks/toggle
 * Toggle bookmark (add if not exists, remove if exists)
 */
export async function toggleBookmark(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { articleId, folder } = req.body;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        message: 'Article ID is required',
      });
    }

    const result = await bookmarkRepository.toggle(userId, articleId, folder);

    res.json({
      success: true,
      data: {
        bookmarked: result.bookmarked,
        bookmark: result.bookmark ? toBookmarkDTO(result.bookmark) : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/bookmarks/:id
 * Get a specific bookmark
 */
export async function getBookmark(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { id } = req.params;
    const bookmark = await bookmarkRepository.findById(id, userId);

    if (!bookmark) {
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found',
      });
    }

    res.json({
      success: true,
      data: toBookmarkDTO(bookmark),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/bookmarks/:id
 * Update a bookmark
 */
export async function updateBookmark(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { folder, notes } = req.body;

    const bookmark = await bookmarkRepository.update(userId, id, { folder, notes });

    if (!bookmark) {
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found',
      });
    }

    res.json({
      success: true,
      data: toBookmarkDTO(bookmark),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/bookmarks/:id
 * Delete a bookmark
 */
export async function deleteBookmark(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { id } = req.params;
    const deleted = await bookmarkRepository.delete(userId, id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found',
      });
    }

    res.json({
      success: true,
      message: 'Bookmark deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/bookmarks/folders
 * Get user's bookmark folders
 */
export async function getFolders(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const [folders, counts] = await Promise.all([
      bookmarkRepository.getUserFolders(userId),
      bookmarkRepository.countByFolder(userId),
    ]);

    res.json({
      success: true,
      data: {
        folders: folders.map(folder => ({
          name: folder,
          count: counts.find(c => c.folder === folder)?.count || 0,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/bookmarks/check/:articleId
 * Check if an article is bookmarked
 */
export async function checkBookmarked(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { articleId } = req.params;
    const bookmarked = await bookmarkRepository.isBookmarked(userId, articleId);

    res.json({
      success: true,
      data: { bookmarked },
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getBookmarks,
  createBookmark,
  toggleBookmark,
  getBookmark,
  updateBookmark,
  deleteBookmark,
  getFolders,
  checkBookmarked,
};

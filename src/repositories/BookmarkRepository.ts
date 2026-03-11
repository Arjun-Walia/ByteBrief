import { Bookmark, IBookmark } from '../models/Bookmark';
import mongoose from 'mongoose';

export interface BookmarkFilters {
  folder?: string;
}

export interface PaginatedBookmarks {
  bookmarks: IBookmark[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Repository for Bookmark database operations
 */
export class BookmarkRepository {
  /**
   * Find bookmark by ID
   */
  async findById(id: string, userId: string): Promise<IBookmark | null> {
    return Bookmark.findOne({ _id: id, user: userId }).populate({
      path: 'article',
      populate: { path: 'category', select: 'name slug icon' },
    });
  }

  /**
   * Check if article is bookmarked by user
   */
  async isBookmarked(userId: string, articleId: string): Promise<boolean> {
    const count = await Bookmark.countDocuments({
      user: userId,
      article: articleId,
    });
    return count > 0;
  }

  /**
   * Find bookmark by user and article
   */
  async findByUserAndArticle(
    userId: string,
    articleId: string
  ): Promise<IBookmark | null> {
    return Bookmark.findOne({
      user: userId,
      article: articleId,
    });
  }

  /**
   * Get user's bookmarks with pagination
   */
  async findByUser(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters: BookmarkFilters = {}
  ): Promise<PaginatedBookmarks> {
    const query: mongoose.FilterQuery<IBookmark> = { user: userId };

    if (filters.folder) {
      query.folder = filters.folder;
    }

    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      Bookmark.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'article',
          populate: { path: 'category', select: 'name slug icon' },
        }),
      Bookmark.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      bookmarks,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Create a new bookmark
   */
  async create(
    userId: string,
    articleId: string,
    folder?: string,
    notes?: string
  ): Promise<IBookmark> {
    const bookmark = new Bookmark({
      user: userId,
      article: articleId,
      folder: folder || 'General',
      notes,
    });

    await bookmark.save();

    return Bookmark.findById(bookmark._id)
      .populate({
        path: 'article',
        populate: { path: 'category', select: 'name slug icon' },
      }) as Promise<IBookmark>;
  }

  /**
   * Toggle bookmark (add if not exists, remove if exists)
   */
  async toggle(
    userId: string,
    articleId: string,
    folder?: string
  ): Promise<{ bookmarked: boolean; bookmark?: IBookmark }> {
    const existing = await this.findByUserAndArticle(userId, articleId);

    if (existing) {
      await this.delete(userId, existing._id.toString());
      return { bookmarked: false };
    }

    const bookmark = await this.create(userId, articleId, folder);
    return { bookmarked: true, bookmark };
  }

  /**
   * Update bookmark folder or notes
   */
  async update(
    userId: string,
    bookmarkId: string,
    updates: { folder?: string; notes?: string }
  ): Promise<IBookmark | null> {
    return Bookmark.findOneAndUpdate(
      { _id: bookmarkId, user: userId },
      { $set: updates },
      { new: true }
    ).populate({
      path: 'article',
      populate: { path: 'category', select: 'name slug icon' },
    });
  }

  /**
   * Move bookmark to a different folder
   */
  async moveToFolder(
    userId: string,
    bookmarkId: string,
    folder: string
  ): Promise<IBookmark | null> {
    return this.update(userId, bookmarkId, { folder });
  }

  /**
   * Delete bookmark by ID
   */
  async delete(userId: string, bookmarkId: string): Promise<boolean> {
    const result = await Bookmark.deleteOne({
      _id: bookmarkId,
      user: userId,
    });
    return result.deletedCount > 0;
  }

  /**
   * Delete bookmark by article ID
   */
  async deleteByArticle(userId: string, articleId: string): Promise<boolean> {
    const result = await Bookmark.deleteOne({
      user: userId,
      article: articleId,
    });
    return result.deletedCount > 0;
  }

  /**
   * Delete all bookmarks for a user
   */
  async deleteAllByUser(userId: string): Promise<number> {
    const result = await Bookmark.deleteMany({ user: userId });
    return result.deletedCount;
  }

  /**
   * Get user's bookmark folders
   */
  async getUserFolders(userId: string): Promise<string[]> {
    const folders = await Bookmark.distinct('folder', { user: userId });
    return folders.sort();
  }

  /**
   * Count bookmarks per folder for a user
   */
  async countByFolder(userId: string): Promise<{ folder: string; count: number }[]> {
    return Bookmark.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$folder', count: { $sum: 1 } } },
      { $project: { folder: '$_id', count: 1, _id: 0 } },
      { $sort: { folder: 1 } },
    ]);
  }

  /**
   * Count total bookmarks for a user
   */
  async countByUser(userId: string): Promise<number> {
    return Bookmark.countDocuments({ user: userId });
  }

  /**
   * Get article IDs for a user's bookmarks
   */
  async getArticleIds(userId: string): Promise<string[]> {
    const bookmarks = await Bookmark.find({ user: userId }).select('article');
    return bookmarks.map(b => b.article.toString());
  }

  /**
   * Bulk check if articles are bookmarked
   */
  async checkBulkBookmarked(
    userId: string,
    articleIds: string[]
  ): Promise<Map<string, boolean>> {
    const bookmarks = await Bookmark.find({
      user: userId,
      article: { $in: articleIds },
    }).select('article');

    const bookmarkedIds = new Set(bookmarks.map(b => b.article.toString()));
    const result = new Map<string, boolean>();

    articleIds.forEach(id => {
      result.set(id, bookmarkedIds.has(id));
    });

    return result;
  }
}

// Singleton instance
export const bookmarkRepository = new BookmarkRepository();

export default bookmarkRepository;

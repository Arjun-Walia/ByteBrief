import { Article, IArticle } from '../models/Article';
import { FilterQuery, UpdateQuery, SortOrder } from 'mongoose';

export interface ArticleFilters {
  category?: string;
  publishedAfter?: Date;
  publishedBefore?: Date;
  isFeatured?: boolean;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Repository for Article database operations
 * Implements the Repository pattern for clean architecture
 */
export class ArticleRepository {
  /**
   * Find article by ID
   */
  async findById(id: string): Promise<IArticle | null> {
    return Article.findById(id).populate('category', 'name slug icon color');
  }

  /**
   * Find article by source URL (for deduplication)
   */
  async findBySourceUrl(sourceUrl: string): Promise<IArticle | null> {
    return Article.findOne({ sourceUrl });
  }

  /**
   * Find article by fingerprint (for deduplication)
   */
  async findByFingerprint(fingerprint: string): Promise<IArticle | null> {
    return Article.findOne({ fingerprint });
  }

  /**
   * Check if article exists by fingerprint
   */
  async existsByFingerprint(fingerprint: string): Promise<boolean> {
    const count = await Article.countDocuments({ fingerprint });
    return count > 0;
  }

  /**
   * Find articles with pagination and filters
   */
  async findWithPagination(
    filters: ArticleFilters,
    options: PaginationOptions
  ): Promise<PaginatedResult<IArticle>> {
    const query = this.buildQuery(filters);
    const { page, limit, sortBy = 'publishedAt', sortOrder = -1 } = options;
    const skip = (page - 1) * limit;

    const [articles, total] = await Promise.all([
      Article.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug icon color')
        .lean()
        .exec(),
      Article.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: articles as unknown as IArticle[],
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  /**
   * Find today's articles (last 24 hours)
   */
  async findTodayArticles(
    options: PaginationOptions
  ): Promise<PaginatedResult<IArticle>> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.findWithPagination(
      { publishedAfter: twentyFourHoursAgo },
      { ...options, sortBy: 'score', sortOrder: -1 }
    );
  }

  /**
   * Find articles by category
   */
  async findByCategory(
    categorySlug: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<IArticle>> {
    return this.findWithPagination(
      { category: categorySlug },
      options
    );
  }

  /**
   * Find top ranked articles
   */
  async findTopRanked(limit: number = 10): Promise<IArticle[]> {
    const articles = await Article.find()
      .sort({ score: -1, publishedAt: -1 })
      .limit(limit)
      .populate('category', 'name slug icon color')
      .lean()
      .exec();
    return articles as unknown as IArticle[];
  }

  /**
   * Find featured article
   */
  async findFeatured(): Promise<IArticle | null> {
    return Article.findOne({ isFeatured: true })
      .populate('category', 'name slug icon color');
  }

  /**
   * Create new article
   */
  async create(articleData: Partial<IArticle>): Promise<IArticle> {
    const article = new Article(articleData);
    return article.save();
  }

  /**
   * Create multiple articles
   */
  async createMany(articles: Partial<IArticle>[]): Promise<IArticle[]> {
    return Article.insertMany(articles, { ordered: false }) as Promise<IArticle[]>;
  }

  /**
   * Update article by ID
   */
  async updateById(
    id: string,
    update: UpdateQuery<IArticle>
  ): Promise<IArticle | null> {
    return Article.findByIdAndUpdate(id, update, { new: true });
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: string): Promise<void> {
    await Article.updateOne({ _id: id }, { $inc: { viewCount: 1 } });
  }

  /**
   * Increment bookmark count
   */
  async incrementBookmarkCount(id: string, amount: number = 1): Promise<void> {
    await Article.updateOne({ _id: id }, { $inc: { bookmarkCount: amount } });
  }

  /**
   * Update scores for all articles (bulk operation)
   */
  async bulkUpdateScores(
    updates: Array<{ id: string; score: number }>
  ): Promise<void> {
    const bulkOps = updates.map(({ id, score }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { score } },
      },
    }));
    await Article.bulkWrite(bulkOps);
  }

  /**
   * Set featured article (unsets previous featured)
   */
  async setFeatured(id: string): Promise<void> {
    await Article.updateMany({}, { isFeatured: false });
    await Article.updateOne({ _id: id }, { isFeatured: true });
  }

  /**
   * Delete article by ID
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await Article.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  /**
   * Delete articles older than given date
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await Article.deleteMany({ publishedAt: { $lt: date } });
    return result.deletedCount;
  }

  /**
   * Count articles by category
   */
  async countByCategory(categorySlug: string): Promise<number> {
    return Article.countDocuments({ categorySlug });
  }

  /**
   * Search articles by text
   */
  async search(
    query: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<IArticle>> {
    return this.findWithPagination({ search: query }, options);
  }

  /**
   * Find articles by IDs
   */
  async findByIds(ids: string[]): Promise<IArticle[]> {
    const articles = await Article.find({ _id: { $in: ids } })
      .populate('category', 'name slug icon color')
      .lean()
      .exec();
    return articles as unknown as IArticle[];
  }

  /**
   * Build MongoDB query from filters
   */
  private buildQuery(filters: ArticleFilters): FilterQuery<IArticle> {
    const query: FilterQuery<IArticle> = {};

    if (filters.category) {
      query.categorySlug = filters.category;
    }

    if (filters.publishedAfter || filters.publishedBefore) {
      query.publishedAt = {};
      if (filters.publishedAfter) {
        query.publishedAt.$gte = filters.publishedAfter;
      }
      if (filters.publishedBefore) {
        query.publishedAt.$lte = filters.publishedBefore;
      }
    }

    if (filters.isFeatured !== undefined) {
      query.isFeatured = filters.isFeatured;
    }

    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    return query;
  }
}

// Singleton instance
export const articleRepository = new ArticleRepository();

export default articleRepository;

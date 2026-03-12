import { Request, Response, NextFunction } from 'express';
import { Article, Category } from '../models';
import { advancedCache, AdvancedCacheService } from '../services/cache/advancedCache';
import { ApiResponse, PaginatedResponse, ArticleDTO, ArticleDetailDTO, NotFoundError } from '../types';
import { logger } from '../utils/logger';

// Cache TTL constants (in seconds)
const CACHE_TTL = {
  FEED: 600,      // 10 minutes for news feeds
  TOP: 600,       // 10 minutes for top articles
  CATEGORY: 600,  // 10 minutes for category feeds
  ARTICLE: 1800,  // 30 minutes for individual articles
  SEARCH: 300,    // 5 minutes for search results
};

const toArticleDTO = (article: InstanceType<typeof Article>): ArticleDTO => ({
  id: article._id.toString(),
  title: article.title,
  summary: article.summary,
  sourceUrl: article.sourceUrl,
  sourceName: article.sourceName,
  imageUrl: article.imageUrl,
  category: (article.category as unknown as { name: string })?.name || '',
  categorySlug: article.categorySlug,
  tags: article.tags,
  author: article.author,
  publishedAt: article.publishedAt.toISOString(),
  score: article.score,
  readTime: article.readTime,
  isFeatured: article.isFeatured,
});

export const getArticles = async (
  req: Request,
  res: Response<ApiResponse<PaginatedResponse<ArticleDTO>>>,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    // Check cache (10-minute TTL)
    const cacheKey = AdvancedCacheService.keys.articles(page, limit);
    const cached = await advancedCache.get<PaginatedResponse<ArticleDTO>>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }

    const [articles, total] = await Promise.all([
      Article.find()
        .sort({ publishedAt: -1, score: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug')
        .lean(), // Use lean() for faster read-only queries
      Article.countDocuments(),
    ]);

    const response: PaginatedResponse<ArticleDTO> = {
      data: articles.map(toArticleDTO as (article: unknown) => ArticleDTO),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };

    await advancedCache.set(cacheKey, response, CACHE_TTL.FEED);
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};

export const getTopArticles = async (
  req: Request,
  res: Response<ApiResponse<ArticleDTO[]>>,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 10));

    // Check cache (10-minute TTL)
    const cacheKey = AdvancedCacheService.keys.topArticles(limit);
    const cached = await advancedCache.get<ArticleDTO[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }

    const articles = await Article.find()
      .sort({ score: -1, publishedAt: -1 })
      .limit(limit)
      .populate('category', 'name slug')
      .lean();

    const data = (articles as unknown[]).map(toArticleDTO as (article: unknown) => ArticleDTO);
    await advancedCache.set(cacheKey, data, CACHE_TTL.TOP);

    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getArticleById = async (
  req: Request,
  res: Response<ApiResponse<ArticleDetailDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check cache (30-minute TTL for individual articles)
    const cacheKey = AdvancedCacheService.keys.articleById(id);
    const cached = await advancedCache.get<ArticleDetailDTO>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }

    const article = await Article.findById(id).populate('category', 'name slug');
    if (!article) {
      throw new NotFoundError('Article');
    }

    // Increment view count (fire and forget)
    Article.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).exec();

    const data: ArticleDetailDTO = {
      ...toArticleDTO(article),
      content: article.content,
      viewCount: article.viewCount,
      bookmarkCount: article.bookmarkCount,
    };

    await advancedCache.set(cacheKey, data, CACHE_TTL.ARTICLE);
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getArticlesByCategory = async (
  req: Request,
  res: Response<ApiResponse<PaginatedResponse<ArticleDTO>>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    // Check cache (10-minute TTL)
    const cacheKey = AdvancedCacheService.keys.articlesByCategory(slug, page, limit);
    const cached = await advancedCache.get<PaginatedResponse<ArticleDTO>>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached });
      return;
    }

    const [articles, total] = await Promise.all([
      Article.find({ categorySlug: slug })
        .sort({ publishedAt: -1, score: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug')
        .lean(),
      Article.countDocuments({ categorySlug: slug }),
    ]);

    const response: PaginatedResponse<ArticleDTO> = {
      data: (articles as unknown[]).map(toArticleDTO as (article: unknown) => ArticleDTO),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };

    await advancedCache.set(cacheKey, response, CACHE_TTL.CATEGORY);
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};

export const searchArticles = async (
  req: Request,
  res: Response<ApiResponse<PaginatedResponse<ArticleDTO>>>,
  next: NextFunction
): Promise<void> => {
  try {
    const query = (req.query.q as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    if (!query.trim()) {
      res.json({
        success: true,
        data: {
          data: [],
          pagination: { page: 1, limit, total: 0, totalPages: 0, hasMore: false },
        },
      });
      return;
    }

    const [articles, total] = await Promise.all([
      Article.find({ $text: { $search: query } })
        .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug'),
      Article.countDocuments({ $text: { $search: query } }),
    ]);

    const response: PaginatedResponse<ArticleDTO> = {
      data: articles.map(toArticleDTO),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};

export default {
  getArticles,
  getTopArticles,
  getArticleById,
  getArticlesByCategory,
  searchArticles,
};

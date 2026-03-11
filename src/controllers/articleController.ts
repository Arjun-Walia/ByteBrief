import { Request, Response, NextFunction } from 'express';
import { Article, Category } from '../models';
import { cacheService, CacheService } from '../services/cache/cacheService';
import { ApiResponse, PaginatedResponse, ArticleDTO, ArticleDetailDTO, NotFoundError } from '../types';
import { logger } from '../utils/logger';

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

    // Check cache
    const cacheKey = CacheService.keys.articles(page, limit);
    const cached = await cacheService.get<PaginatedResponse<ArticleDTO>>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const [articles, total] = await Promise.all([
      Article.find()
        .sort({ publishedAt: -1, score: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug'),
      Article.countDocuments(),
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

    await cacheService.set(cacheKey, response, 300); // 5 min cache
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

    // Check cache
    const cacheKey = CacheService.keys.topArticles();
    const cached = await cacheService.get<ArticleDTO[]>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached.slice(0, limit) });
      return;
    }

    const articles = await Article.find()
      .sort({ score: -1, publishedAt: -1 })
      .limit(20)
      .populate('category', 'name slug');

    const data = articles.map(toArticleDTO);
    await cacheService.set(cacheKey, data, 600); // 10 min cache

    res.json({ success: true, data: data.slice(0, limit) });
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

    // Check cache
    const cacheKey = CacheService.keys.articleById(id);
    const cached = await cacheService.get<ArticleDetailDTO>(cacheKey);
    if (cached) {
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

    await cacheService.set(cacheKey, data, 1800); // 30 min cache
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

    // Check cache
    const cacheKey = CacheService.keys.articlesByCategory(slug, page);
    const cached = await cacheService.get<PaginatedResponse<ArticleDTO>>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const [articles, total] = await Promise.all([
      Article.find({ categorySlug: slug })
        .sort({ publishedAt: -1, score: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug'),
      Article.countDocuments({ categorySlug: slug }),
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

    await cacheService.set(cacheKey, response, 300);
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

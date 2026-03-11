import { Request, Response, NextFunction } from 'express';
import { articleRepository, PaginatedResult } from '../repositories';
import { IArticle } from '../models/Article';
import { Category } from '../models/Category';
import { cacheService } from '../services/cache/cacheService';

// Suppress unused variable warning for Category (used for validation)
void Category;

/**
 * Transform article to DTO format
 */
function toArticleDTO(article: IArticle) {
  return {
    id: article._id,
    title: article.title,
    summary: article.summary,
    source: article.sourceName,
    sourceUrl: article.sourceUrl,
    imageUrl: article.imageUrl,
    category: article.category,
    tags: article.tags,
    readTime: article.readTime,
    relevanceScore: article.score,
    publishedAt: article.publishedAt,
    createdAt: article.createdAt,
  };
}

/**
 * GET /api/v1/news/today
 * Get today's top news articles
 */
export async function getTodayNews(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const categorySlug = req.query.category as string | undefined;

    // Build cache key
    const cacheKey = categorySlug
      ? `news:today:${categorySlug}:${page}:${limit}`
      : `news:today:${page}:${limit}`;

    // Try cache first
    const cached = await cacheService.get<PaginatedResult<IArticle>>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          ...cached,
          articles: cached.data.map(toArticleDTO),
        },
      });
    }

    // Fetch today's articles (optionally filtered by category)
    const result = categorySlug
      ? await articleRepository.findByCategory(categorySlug, { page, limit })
      : await articleRepository.findTodayArticles({ page, limit });

    // Cache for 5 minutes
    await cacheService.set(cacheKey, result, 300);

    res.json({
      success: true,
      data: {
        articles: result.data.map(toArticleDTO),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasMore: result.page < result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/news/category/:category
 * Get news articles by category
 */
export async function getNewsByCategory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { category: categorySlug } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Build cache key
    const cacheKey = `news:category:${categorySlug}:${page}:${limit}`;

    // Try cache first
    const cached = await cacheService.get<PaginatedResult<IArticle>>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          ...cached,
          articles: cached.data.map(toArticleDTO),
        },
      });
    }

    // Find category by slug
    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Fetch articles by category slug
    const result = await articleRepository.findByCategory(categorySlug, { page, limit });

    // Cache for 5 minutes
    await cacheService.set(cacheKey, result, 300);

    res.json({
      success: true,
      data: {
        category: {
          id: category._id,
          name: category.name,
          slug: category.slug,
          icon: category.icon,
        },
        articles: result.data.map(toArticleDTO),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasMore: result.page < result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/news/top
 * Get top ranked articles
 */
export async function getTopNews(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const cacheKey = `news:top:${limit}`;

    // Try cache first
    const cached = await cacheService.get<IArticle[]>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          articles: cached.map(toArticleDTO),
        },
      });
    }

    const articles = await articleRepository.findTopRanked(limit);

    // Cache for 10 minutes
    await cacheService.set(cacheKey, articles, 600);

    res.json({
      success: true,
      data: {
        articles: articles.map(toArticleDTO),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/news/search
 * Search news articles
 */
export async function searchNews(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    const result = await articleRepository.search(query.trim(), { page, limit });

    res.json({
      success: true,
      data: {
        query: query.trim(),
        articles: result.data.map(toArticleDTO),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasMore: result.page < result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getTodayNews,
  getNewsByCategory,
  getTopNews,
  searchNews,
};

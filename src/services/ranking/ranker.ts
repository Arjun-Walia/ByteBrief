/**
 * Ranking Service (Backward Compatible)
 * 
 * Wraps the enhanced ranking service for backward compatibility.
 * For new code, import from './service' directly.
 */

import { Article, IArticle } from '../../models';
import { logger } from '../../utils/logger';
import { enhancedRankingService } from './service';
import { RankingAlgorithm } from './algorithm';

// Re-export types for backward compatibility
export interface RankingFactors {
  recencyWeight: number;
  sourceWeight: number;
  engagementWeight: number;
  categoryBoost: Record<string, number>;
}

const DEFAULT_FACTORS: RankingFactors = {
  recencyWeight: 0.4,
  sourceWeight: 0.3,
  engagementWeight: 0.3,
  categoryBoost: {
    ai: 1.2,
    security: 1.1,
    startups: 1.0,
    devtools: 1.0,
    tech: 0.9,
  },
};

export class RankingService {
  private factors: RankingFactors;
  private algorithm: RankingAlgorithm;

  constructor(factors?: Partial<RankingFactors>) {
    this.factors = { ...DEFAULT_FACTORS, ...factors };
    this.algorithm = new RankingAlgorithm();
  }

  /**
   * Calculate score for a single article
   * @deprecated Use RankingAlgorithm.rankArticle() for full analysis
   */
  calculateScore(article: {
    publishedAt: Date;
    sourceName: string;
    categorySlug: string;
    viewCount: number;
    bookmarkCount: number;
  }): number {
    const result = this.algorithm.rankArticle({
      _id: 'temp',
      title: '',
      sourceName: article.sourceName,
      categorySlug: article.categorySlug,
      publishedAt: article.publishedAt,
      viewCount: article.viewCount,
      bookmarkCount: article.bookmarkCount,
    });
    return Math.round(result.finalScore * 100);
  }

  /**
   * Rank all articles using the enhanced algorithm
   */
  async rankAllArticles(): Promise<number> {
    return enhancedRankingService.rankAllArticles();
  }

  /**
   * Get top ranked articles
   */
  async getTopArticles(limit = 10): Promise<IArticle[]> {
    const articles = await Article.find()
      .sort({ score: -1, publishedAt: -1 })
      .limit(limit)
      .populate('category', 'name slug');
    return articles;
  }
}

export const rankingService = new RankingService();

export default rankingService;

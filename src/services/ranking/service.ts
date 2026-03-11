/**
 * Enhanced Ranking Service
 * 
 * Orchestrates the ranking algorithm to:
 * 1. Process articles every 6 hours
 * 2. Update scores in MongoDB
 * 3. Select and store daily top 10
 */

import { Article } from '../../models';
import { logger } from '../../utils/logger';
import { RankingAlgorithm, DEFAULT_CONFIG } from './algorithm';
import {
  RankingResult,
  RankingJobResult,
  DailyFeed,
  RankingConfig,
} from './types';

/**
 * Enhanced ranking service with job orchestration
 */
export class EnhancedRankingService {
  private algorithm: RankingAlgorithm;

  constructor(config?: Partial<RankingConfig>) {
    this.algorithm = new RankingAlgorithm(config);
  }

  /**
   * Main ranking job - runs every 6 hours
   * 1. Fetches recent articles
   * 2. Computes scores using algorithm
   * 3. Updates MongoDB
   * 4. Selects top 10 for daily feed
   */
  async runRankingJob(): Promise<RankingJobResult> {
    const startTime = Date.now();
    logger.info('=== Starting Ranking Job ===');

    try {
      // Step 1: Fetch candidate articles (last 72 hours)
      const maxAgeHours = DEFAULT_CONFIG.maxArticleAgeHours;
      const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

      const articles = await Article.find({
        publishedAt: { $gte: cutoffDate },
      })
        .select('_id title content tags sourceName categorySlug publishedAt viewCount bookmarkCount clusterId fingerprint')
        .lean();

      logger.info(`Found ${articles.length} articles from last ${maxAgeHours} hours`);

      if (articles.length === 0) {
        return {
          timestamp: new Date(),
          articlesProcessed: 0,
          articlesRanked: 0,
          topArticles: [],
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Step 2: Count related articles (same story from different sources)
      const articleWithCounts = await this.enrichWithSourceCounts(articles);

      // Step 3: Rank all articles
      const rankedArticles: RankingResult[] = [];
      
      for (const article of articleWithCounts) {
        try {
          const result = this.algorithm.rankArticle({
            _id: String(article._id),
            title: article.title,
            content: article.content,
            tags: article.tags,
            sourceName: article.sourceName,
            categorySlug: article.categorySlug,
            publishedAt: new Date(article.publishedAt),
            viewCount: article.viewCount || 0,
            bookmarkCount: article.bookmarkCount || 0,
            relatedArticleCount: article.relatedArticleCount || 1,
          });
          rankedArticles.push(result);
        } catch (error) {
          logger.error(`Failed to rank article ${article._id}:`, error);
        }
      }

      // Step 4: Sort by score
      rankedArticles.sort((a, b) => b.finalScore - a.finalScore);

      // Step 5: Update scores in MongoDB (batch update)
      await this.updateArticleScores(rankedArticles);

      // Step 6: Select top 10 and mark as featured
      const topArticles = rankedArticles.slice(0, 10).map((r, i) => ({
        ...r,
        rank: i + 1,
      }));

      await this.markTopArticles(topArticles);

      // Step 7: Store daily feed
      await this.storeDailyFeed(topArticles, articles.length);

      const processingTimeMs = Date.now() - startTime;
      logger.info(`=== Ranking Complete: ${rankedArticles.length} ranked, ${processingTimeMs}ms ===`);

      // Log top 5 for debugging
      logger.info('Top 5 articles:');
      for (const article of topArticles.slice(0, 5)) {
        logger.info(
          `  #${article.rank}: ${article.title.substring(0, 60)}... ` +
          `(score: ${article.finalScore.toFixed(4)})`
        );
      }

      return {
        timestamp: new Date(),
        articlesProcessed: articles.length,
        articlesRanked: rankedArticles.length,
        topArticles,
        processingTimeMs,
      };
    } catch (error) {
      logger.error('Ranking job failed:', error);
      throw error;
    }
  }

  /**
   * Enrich articles with source count (related articles covering same story)
   * Uses clusterId or fingerprint similarity
   */
  private async enrichWithSourceCounts(
    articles: Array<{
      _id: unknown;
      title: string;
      content?: string;
      tags?: string[];
      sourceName: string;
      categorySlug: string;
      publishedAt: Date;
      viewCount?: number;
      bookmarkCount?: number;
      clusterId?: string;
      fingerprint: string;
    }>
  ): Promise<Array<typeof articles[0] & { relatedArticleCount: number }>> {
    // Group articles by clusterId
    const clusterCounts = new Map<string, number>();
    
    for (const article of articles) {
      if (article.clusterId) {
        const count = clusterCounts.get(article.clusterId) || 0;
        clusterCounts.set(article.clusterId, count + 1);
      }
    }

    // Add related article count to each article
    return articles.map((article) => ({
      ...article,
      relatedArticleCount: article.clusterId
        ? clusterCounts.get(article.clusterId) || 1
        : 1,
    }));
  }

  /**
   * Batch update article scores in MongoDB
   */
  private async updateArticleScores(ranked: RankingResult[]): Promise<void> {
    const batchSize = 100;
    
    for (let i = 0; i < ranked.length; i += batchSize) {
      const batch = ranked.slice(i, i + batchSize);
      
      const bulkOps = batch.map((result) => ({
        updateOne: {
          filter: { _id: result.articleId },
          update: {
            $set: {
              score: Math.round(result.finalScore * 100), // Store as integer 0-100
            },
          },
        },
      }));

      await Article.bulkWrite(bulkOps);
    }

    logger.info(`Updated scores for ${ranked.length} articles`);
  }

  /**
   * Mark top articles as featured
   */
  private async markTopArticles(topArticles: RankingResult[]): Promise<void> {
    // Clear previous featured flags for recent articles
    await Article.updateMany(
      { publishedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      { isFeatured: false }
    );

    // Mark top article as featured
    if (topArticles.length > 0) {
      await Article.findByIdAndUpdate(topArticles[0].articleId, {
        isFeatured: true,
      });
      logger.info(`Featured article: ${topArticles[0].title.substring(0, 50)}...`);
    }
  }

  /**
   * Store daily feed in cache/database
   */
  private async storeDailyFeed(
    topArticles: RankingResult[],
    totalCandidates: number
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const dailyFeed: DailyFeed = {
      date: today,
      generatedAt: new Date(),
      articles: topArticles,
      totalCandidates,
    };

    // Store in a separate collection or cache
    // For now, just log it
    logger.info(`Daily feed for ${today}: ${topArticles.length} top articles from ${totalCandidates} candidates`);
  }

  /**
   * Get current top articles
   */
  async getTopArticles(limit: number = 10): Promise<RankingResult[]> {
    const maxAgeHours = DEFAULT_CONFIG.maxArticleAgeHours;
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const articles = await Article.find({
      publishedAt: { $gte: cutoffDate },
    })
      .sort({ score: -1, publishedAt: -1 })
      .limit(limit)
      .select('_id title content tags sourceName categorySlug publishedAt viewCount bookmarkCount score')
      .lean();

    // Re-rank for freshest scores
    return articles.map((article, index) => {
      const result = this.algorithm.rankArticle({
        _id: String(article._id),
        title: article.title,
        content: article.content,
        tags: article.tags,
        sourceName: article.sourceName,
        categorySlug: article.categorySlug,
        publishedAt: new Date(article.publishedAt),
        viewCount: article.viewCount || 0,
        bookmarkCount: article.bookmarkCount || 0,
      });
      return { ...result, rank: index + 1 };
    });
  }

  /**
   * Rank all articles (legacy compatibility)
   */
  async rankAllArticles(): Promise<number> {
    const result = await this.runRankingJob();
    return result.articlesRanked;
  }
}

// Export singleton instance
export const enhancedRankingService = new EnhancedRankingService();
export default enhancedRankingService;

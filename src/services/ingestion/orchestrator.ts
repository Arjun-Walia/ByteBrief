import { Article, Category } from '../../models';
import { logger } from '../../utils/logger';
import { RawArticle, ProcessedArticle, IngestionResult, IngestionRunResult } from './types';

// Import source clients
import { newsAPIClient } from './sources/newsapi';
import { gNewsClient } from './sources/gnews';
import { hackerNewsClient } from './sources/hackernews';
import { githubTrendingClient } from './sources/github-trending';

// Import utilities
import { deduplicationService } from './utils/deduplication';
import { contentNormalizer } from './utils/normalizer';
import { techFilter } from './utils/techFilter';

/**
 * Main news ingestion orchestrator
 * Coordinates fetching from multiple sources, deduplication, and storage
 */
export class IngestionOrchestrator {
  private categoryCache: Map<string, string> = new Map();

  /**
   * Run full ingestion pipeline
   */
  async runIngestion(): Promise<IngestionRunResult> {
    const startTime = new Date();
    const sourceResults: IngestionResult[] = [];

    logger.info('=== Starting News Ingestion Pipeline ===');

    try {
      // Initialize deduplication cache
      await deduplicationService.initialize();

      // Load category mappings
      await this.loadCategories();

      // Fetch from all sources in parallel (with individual error handling)
      const [newsapiResult, gnewsResult, hnResult, githubResult] = await Promise.all([
        this.fetchFromNewsAPI(),
        this.fetchFromGNews(),
        this.fetchFromHackerNews(),
        this.fetchFromGitHubTrending(),
      ]);

      sourceResults.push(newsapiResult, gnewsResult, hnResult, githubResult);

      // Calculate totals
      const totalFetched = sourceResults.reduce((sum, r) => sum + r.fetched, 0);
      const totalNew = sourceResults.reduce((sum, r) => sum + r.new, 0);
      const totalDuplicates = sourceResults.reduce((sum, r) => sum + r.duplicates, 0);
      const totalErrors = sourceResults.reduce((sum, r) => sum + r.errors, 0);

      const endTime = new Date();
      const result: IngestionRunResult = {
        startTime,
        endTime,
        totalFetched,
        totalNew,
        totalDuplicates,
        totalErrors,
        sourceResults,
      };

      logger.info('=== Ingestion Complete ===');
      logger.info(`Total: ${totalFetched} fetched, ${totalNew} new, ${totalDuplicates} duplicates, ${totalErrors} errors`);
      logger.info(`Duration: ${(endTime.getTime() - startTime.getTime()) / 1000}s`);

      return result;
    } catch (error) {
      logger.error('Ingestion pipeline failed:', error);
      throw error;
    } finally {
      // Clear deduplication cache to free memory
      deduplicationService.clearCache();
    }
  }

  /**
   * Fetch from NewsAPI
   */
  private async fetchFromNewsAPI(): Promise<IngestionResult> {
    const sourceName = 'NewsAPI';
    const startTime = Date.now();
    let fetched = 0, newCount = 0, duplicates = 0, errors = 0;

    try {
      logger.info(`[${sourceName}] Starting fetch...`);

      // Fetch both top headlines and general tech news
      const [headlines, news] = await Promise.all([
        newsAPIClient.fetchTopHeadlines(),
        newsAPIClient.fetchTechNews(100),
      ]);

      const allArticles = [...headlines, ...news];
      fetched = allArticles.length;

      // Filter tech content
      const techArticles = techFilter.filterTechArticles(allArticles);
      logger.info(`[${sourceName}] ${techArticles.length}/${fetched} are tech-related`);

      // Process and store
      const result = await this.processAndStoreArticles(techArticles, sourceName);
      newCount = result.new;
      duplicates = result.duplicates;
      errors = result.errors;
    } catch (error) {
      logger.error(`[${sourceName}] Fetch failed:`, error);
      errors++;
    }

    return {
      source: sourceName,
      fetched,
      new: newCount,
      duplicates,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Fetch from GNews
   */
  private async fetchFromGNews(): Promise<IngestionResult> {
    const sourceName = 'GNews';
    const startTime = Date.now();
    let fetched = 0, newCount = 0, duplicates = 0, errors = 0;

    try {
      logger.info(`[${sourceName}] Starting fetch...`);

      const [headlines, news] = await Promise.all([
        gNewsClient.fetchTopTechHeadlines(),
        gNewsClient.fetchTechNews(),
      ]);

      const allArticles = [...headlines, ...news];
      fetched = allArticles.length;

      const techArticles = techFilter.filterTechArticles(allArticles);
      logger.info(`[${sourceName}] ${techArticles.length}/${fetched} are tech-related`);

      const result = await this.processAndStoreArticles(techArticles, sourceName);
      newCount = result.new;
      duplicates = result.duplicates;
      errors = result.errors;
    } catch (error) {
      logger.error(`[${sourceName}] Fetch failed:`, error);
      errors++;
    }

    return {
      source: sourceName,
      fetched,
      new: newCount,
      duplicates,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Fetch from Hacker News
   */
  private async fetchFromHackerNews(): Promise<IngestionResult> {
    const sourceName = 'HackerNews';
    const startTime = Date.now();
    let fetched = 0, newCount = 0, duplicates = 0, errors = 0;

    try {
      logger.info(`[${sourceName}] Starting fetch...`);

      const [top, newest, best] = await Promise.all([
        hackerNewsClient.fetchTopStories(50),
        hackerNewsClient.fetchNewStories(30),
        hackerNewsClient.fetchBestStories(20),
      ]);

      // Deduplicate by URL before processing
      const seen = new Set<string>();
      const allArticles: RawArticle[] = [];
      for (const article of [...top, ...newest, ...best]) {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          allArticles.push(article);
        }
      }

      fetched = allArticles.length;

      // HN content is already tech-focused, but still filter
      const techArticles = techFilter.filterTechArticles(allArticles);
      logger.info(`[${sourceName}] ${techArticles.length}/${fetched} are tech-related`);

      const result = await this.processAndStoreArticles(techArticles, sourceName);
      newCount = result.new;
      duplicates = result.duplicates;
      errors = result.errors;
    } catch (error) {
      logger.error(`[${sourceName}] Fetch failed:`, error);
      errors++;
    }

    return {
      source: sourceName,
      fetched,
      new: newCount,
      duplicates,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Fetch from GitHub Trending
   */
  private async fetchFromGitHubTrending(): Promise<IngestionResult> {
    const sourceName = 'GitHubTrending';
    const startTime = Date.now();
    let fetched = 0, newCount = 0, duplicates = 0, errors = 0;

    try {
      logger.info(`[${sourceName}] Starting fetch...`);

      const articles = await githubTrendingClient.fetchTrendingRepos();
      fetched = articles.length;

      // GitHub Trending is all tech by definition
      logger.info(`[${sourceName}] ${fetched} repositories fetched`);

      const result = await this.processAndStoreArticles(articles, sourceName);
      newCount = result.new;
      duplicates = result.duplicates;
      errors = result.errors;
    } catch (error) {
      logger.error(`[${sourceName}] Fetch failed:`, error);
      errors++;
    }

    return {
      source: sourceName,
      fetched,
      new: newCount,
      duplicates,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Process and store articles
   */
  private async processAndStoreArticles(
    articles: RawArticle[],
    sourceName: string
  ): Promise<{ new: number; duplicates: number; errors: number }> {
    let newCount = 0, duplicates = 0, errors = 0;

    for (const raw of articles) {
      try {
        // Check for duplicates
        const dupCheck = await deduplicationService.checkDuplicate(
          raw.url,
          raw.title,
          raw.content
        );

        if (dupCheck.isDuplicate) {
          duplicates++;
          continue;
        }

        // Normalize article
        const processed = contentNormalizer.normalize(raw);

        // Get or create category
        const categoryId = await this.getOrCreateCategory(processed.categorySlug);

        // Create article document
        const article = new Article({
          title: processed.title,
          summary: processed.summary,
          content: processed.content,
          sourceUrl: processed.sourceUrl,
          sourceName: processed.sourceName,
          categorySlug: processed.categorySlug,
          category: categoryId,
          tags: processed.tags,
          author: processed.author,
          imageUrl: processed.imageUrl,
          publishedAt: processed.publishedAt,
          fingerprint: processed.fingerprint,
          readTime: processed.readTime,
          score: 0, // Will be set by ranking service
          isFeatured: false,
          viewCount: 0,
          bookmarkCount: 0,
        });

        await article.save();

        // Add to deduplication cache
        deduplicationService.addToCache(
          article._id.toString(),
          processed.sourceUrl,
          processed.title,
          processed.fingerprint
        );

        newCount++;
      } catch (error) {
        // Check if it's a duplicate key error (race condition)
        if ((error as Error).message?.includes('duplicate key')) {
          duplicates++;
        } else {
          logger.warn(`[${sourceName}] Failed to process article: ${raw.title.substring(0, 50)}`, error);
          errors++;
        }
      }
    }

    logger.info(`[${sourceName}] Stored ${newCount} new, ${duplicates} dupes, ${errors} errors`);
    return { new: newCount, duplicates, errors };
  }

  /**
   * Load categories into cache
   */
  private async loadCategories(): Promise<void> {
    const categories = await Category.find().lean();
    this.categoryCache.clear();
    for (const cat of categories) {
      this.categoryCache.set(cat.slug, cat._id.toString());
    }
    logger.debug(`Loaded ${categories.length} categories into cache`);
  }

  /**
   * Get category ID, creating if needed
   */
  private async getOrCreateCategory(slug: string): Promise<string> {
    // Check cache first
    if (this.categoryCache.has(slug)) {
      return this.categoryCache.get(slug)!;
    }

    // Try to find existing
    const existingCategory = await Category.findOne({ slug }).lean();

    if (existingCategory) {
      this.categoryCache.set(slug, existingCategory._id.toString());
      return existingCategory._id.toString();
    }

    // Create new category
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    const newCategory = new Category({
      name,
      slug,
      description: `${name} news and articles`,
      icon: this.getCategoryIcon(slug),
      color: this.getCategoryColor(slug),
      isActive: true,
      sortOrder: 99,
    });
    const savedCategory = await newCategory.save();
    logger.info(`Created new category: ${slug}`);

    // Add to cache
    this.categoryCache.set(slug, savedCategory._id.toString());
    return savedCategory._id.toString();
  }

  /**
   * Get default icon for category
   */
  private getCategoryIcon(slug: string): string {
    const icons: Record<string, string> = {
      ai: '🤖',
      programming: '💻',
      cloud: '☁️',
      security: '🔒',
      startups: '🚀',
      mobile: '📱',
      blockchain: '⛓️',
      hardware: '🔧',
      opensource: '🐙',
      technology: '⚡',
    };
    return icons[slug] || '📰';
  }

  /**
   * Get default color for category
   */
  private getCategoryColor(slug: string): string {
    const colors: Record<string, string> = {
      ai: '#8B5CF6',
      programming: '#3B82F6',
      cloud: '#06B6D4',
      security: '#EF4444',
      startups: '#F59E0B',
      mobile: '#10B981',
      blockchain: '#6366F1',
      hardware: '#F97316',
      opensource: '#22C55E',
      technology: '#6B7280',
    };
    return colors[slug] || '#6B7280';
  }
}

export const ingestionOrchestrator = new IngestionOrchestrator();
export default ingestionOrchestrator;

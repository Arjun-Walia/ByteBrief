import { Article } from '../../../models';
import { logger } from '../../../utils/logger';
import { SimilarityResult } from '../types';
import crypto from 'crypto';

/**
 * Service to detect and handle duplicate articles
 */
export class DeduplicationService {
  private urlCache: Map<string, string> = new Map();
  private fingerprintCache: Set<string> = new Set();
  private titleCache: Map<string, { id: string; title: string }[]> = new Map();

  /**
   * Initialize caches with recent articles
   */
  async initialize(): Promise<void> {
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const recentArticles = await Article.find({
      publishedAt: { $gte: recentDate },
    }).select('_id sourceUrl fingerprint title').lean();

    for (const article of recentArticles) {
      // URL cache
      const normalizedUrl = this.normalizeUrl(article.sourceUrl);
      this.urlCache.set(normalizedUrl, article._id.toString());

      // Fingerprint cache
      if (article.fingerprint) {
        this.fingerprintCache.add(article.fingerprint);
      }

      // Title cache (group by first word for faster lookup)
      const firstWord = this.getFirstWord(article.title);
      if (!this.titleCache.has(firstWord)) {
        this.titleCache.set(firstWord, []);
      }
      this.titleCache.get(firstWord)!.push({
        id: article._id.toString(),
        title: article.title,
      });
    }

    logger.info(`Deduplication cache initialized with ${recentArticles.length} articles`);
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.urlCache.clear();
    this.fingerprintCache.clear();
    this.titleCache.clear();
  }

  /**
   * Check if an article is a duplicate
   */
  async checkDuplicate(
    url: string,
    title: string,
    content?: string
  ): Promise<SimilarityResult> {
    // 1. Exact URL match (fastest)
    const normalizedUrl = this.normalizeUrl(url);
    if (this.urlCache.has(normalizedUrl)) {
      return {
        isDuplicate: true,
        similarityScore: 1.0,
        matchedArticleId: this.urlCache.get(normalizedUrl),
        matchedUrl: url,
        matchType: 'url',
      };
    }

    // 2. Content fingerprint match
    const fingerprint = this.generateFingerprint(title, content || '');
    if (this.fingerprintCache.has(fingerprint)) {
      return {
        isDuplicate: true,
        similarityScore: 1.0,
        matchType: 'content',
      };
    }

    // 3. Title similarity check
    const titleResult = this.checkTitleSimilarity(title);
    if (titleResult.isDuplicate) {
      return titleResult;
    }

    // 4. Database check for URL (in case cache is stale)
    const existingByUrl = await Article.findOne({ sourceUrl: url }).select('_id').lean();
    if (existingByUrl) {
      // Update cache
      this.urlCache.set(normalizedUrl, existingByUrl._id.toString());
      return {
        isDuplicate: true,
        similarityScore: 1.0,
        matchedArticleId: existingByUrl._id.toString(),
        matchedUrl: url,
        matchType: 'url',
      };
    }

    return {
      isDuplicate: false,
      similarityScore: 0,
      matchType: 'none',
    };
  }

  /**
   * Generate content fingerprint for deduplication
   */
  generateFingerprint(title: string, content: string): string {
    // Normalize: lowercase, remove punctuation, collapse whitespace
    const normalizedTitle = title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedContent = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 500); // First 500 chars for fingerprinting

    const combined = `${normalizedTitle}|${normalizedContent}`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
  }

  /**
   * Add article to cache after successful storage
   */
  addToCache(articleId: string, url: string, title: string, fingerprint: string): void {
    const normalizedUrl = this.normalizeUrl(url);
    this.urlCache.set(normalizedUrl, articleId);
    this.fingerprintCache.add(fingerprint);

    const firstWord = this.getFirstWord(title);
    if (!this.titleCache.has(firstWord)) {
      this.titleCache.set(firstWord, []);
    }
    this.titleCache.get(firstWord)!.push({ id: articleId, title });
  }

  /**
   * Check title similarity against cached titles
   */
  private checkTitleSimilarity(title: string): SimilarityResult {
    const firstWord = this.getFirstWord(title);
    const candidates = this.titleCache.get(firstWord) || [];

    for (const candidate of candidates) {
      const similarity = this.calculateTitleSimilarity(title, candidate.title);
      if (similarity >= 0.85) {
        return {
          isDuplicate: true,
          similarityScore: similarity,
          matchedArticleId: candidate.id,
          matchType: 'title',
        };
      }
    }

    return {
      isDuplicate: false,
      similarityScore: 0,
      matchType: 'none',
    };
  }

  /**
   * Calculate Jaccard similarity between two titles
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = this.tokenizeTitle(title1);
    const words2 = this.tokenizeTitle(title2);

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Tokenize title into normalized word set
   */
  private tokenizeTitle(title: string): Set<string> {
    return new Set(
      title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2) // Skip small words
    );
  }

  /**
   * Get first significant word from title (for bucket hashing)
   */
  private getFirstWord(title: string): string {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'this', 'that']);
    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return words[0] || title.substring(0, 5).toLowerCase();
  }

  /**
   * Normalize URL for comparison
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slashes, www, and common tracking params
      let normalized = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`.replace(/\/+$/, '');
      
      // Sort and include relevant query params
      const relevantParams = ['id', 'p', 'article', 'story'];
      const params = new URLSearchParams();
      
      relevantParams.forEach(key => {
        const value = parsed.searchParams.get(key);
        if (value) params.set(key, value);
      });

      const queryString = params.toString();
      if (queryString) {
        normalized += `?${queryString}`;
      }

      return normalized.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }
}

export const deduplicationService = new DeduplicationService();
export default deduplicationService;

/**
 * Article Clustering Service
 * 
 * Groups articles reporting the same story from multiple sources.
 * Uses cosine similarity for matching and selects the best canonical source.
 * 
 * ## Algorithm
 * 
 * 1. **Candidate Selection**: Use n-gram/Jaccard for fast pre-filtering
 * 2. **Precise Matching**: Cosine similarity on TF-IDF vectors
 * 3. **Clustering**: Union-Find for efficient grouping
 * 4. **Canonical Selection**: Multi-factor scoring for best source
 * 5. **Merge**: Combine source references in cluster
 * 
 * ## Performance
 * - Pre-filtering reduces O(n²) to O(n×k) where k << n
 * - Batch processing for MongoDB efficiency
 * - Incremental updates avoid reprocessing
 */

import { Article } from '../../models';
import { logger } from '../../utils/logger';
import { SimilarityEngine, similarityEngine } from './similarity';
import {
  ArticleForDedup,
  ArticleCluster,
  ClusterMember,
  SimilarityMatch,
  SourceQuality,
  DuplicateDetectionResult,
  ClusteringResult,
  DuplicateDetectionConfig,
} from './types';
import crypto from 'crypto';

// Default configuration
const DEFAULT_CONFIG: DuplicateDetectionConfig = {
  exactMatchThreshold: 0.95,
  nearMatchThreshold: 0.80,
  relatedThreshold: 0.60,
  minContentLength: 100,
  maxComparisons: 500,
  clusterTimeWindowHours: 72,
};

// Source authority scores for canonical selection
const SOURCE_AUTHORITY: Record<string, number> = {
  'OpenAI Blog': 100,
  'Google AI Blog': 100,
  'Microsoft Research': 98,
  'GitHub Blog': 95,
  'MIT Technology Review': 95,
  'Anthropic Blog': 95,
  'Ars Technica': 90,
  'TechCrunch': 88,
  'The Verge': 85,
  'Wired': 85,
  'VentureBeat': 80,
  'Krebs on Security': 95,
  'Schneier on Security': 92,
  'Hacker News': 70,
  'Reddit': 50,
  'DEV Community': 55,
  'GitHub Trending': 75,
};

/**
 * Union-Find data structure for efficient clustering
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }

    if (this.parent.get(x) !== x) {
      // Path compression
      this.parent.set(x, this.find(this.parent.get(x)!));
    }

    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    // Union by rank
    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();

    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!clusters.has(root)) {
        clusters.set(root, []);
      }
      clusters.get(root)!.push(id);
    }

    return clusters;
  }
}

/**
 * Article clustering and duplicate detection service
 */
export class ClusteringService {
  private config: DuplicateDetectionConfig;
  private similarity: SimilarityEngine;
  private articleIndex: Map<string, ArticleForDedup> = new Map();
  private titleIndex: Map<string, string[]> = new Map(); // first-word -> article IDs
  private urlIndex: Map<string, string> = new Map(); // normalized URL -> article ID

  constructor(config: Partial<DuplicateDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.similarity = similarityEngine;
  }

  /**
   * Initialize indexes from database
   */
  async initialize(): Promise<void> {
    const cutoffDate = new Date(
      Date.now() - this.config.clusterTimeWindowHours * 60 * 60 * 1000
    );

    const articles = await Article.find({
      publishedAt: { $gte: cutoffDate },
    })
      .select('_id title content sourceUrl sourceName publishedAt score viewCount bookmarkCount')
      .lean();

    logger.info(`Loading ${articles.length} articles into clustering index...`);

    // Initialize similarity engine corpus
    const texts = articles.map(a => `${a.title} ${a.content?.substring(0, 500) || ''}`);
    this.similarity.initializeCorpus(texts);

    // Build indexes
    for (const article of articles) {
      const articleData: ArticleForDedup = {
        id: String(article._id),
        title: article.title,
        content: article.content,
        sourceUrl: article.sourceUrl,
        sourceName: article.sourceName,
        publishedAt: new Date(article.publishedAt),
        score: article.score,
        viewCount: article.viewCount,
        bookmarkCount: article.bookmarkCount,
      };

      this.addToIndex(articleData);
    }

    logger.info(
      `Clustering index initialized: ${this.articleIndex.size} articles, ` +
      `${this.titleIndex.size} title buckets`
    );
  }

  /**
   * Add article to indexes
   */
  private addToIndex(article: ArticleForDedup): void {
    this.articleIndex.set(article.id, article);

    // URL index
    const normalizedUrl = this.normalizeUrl(article.sourceUrl);
    this.urlIndex.set(normalizedUrl, article.id);

    // Title index (bucket by first significant word)
    const firstWord = this.getFirstSignificantWord(article.title);
    if (!this.titleIndex.has(firstWord)) {
      this.titleIndex.set(firstWord, []);
    }
    this.titleIndex.get(firstWord)!.push(article.id);
  }

  /**
   * Check if article is a duplicate and find matches
   */
  async detectDuplicates(article: ArticleForDedup): Promise<DuplicateDetectionResult> {
    // 1. Exact URL match (fastest)
    const normalizedUrl = this.normalizeUrl(article.sourceUrl);
    if (this.urlIndex.has(normalizedUrl)) {
      const matchedId = this.urlIndex.get(normalizedUrl)!;
      const matched = this.articleIndex.get(matchedId);
      return {
        isDuplicate: true,
        matchedArticles: [{
          articleId: matchedId,
          title: matched?.title || '',
          score: 1.0,
          matchType: 'exact',
        }],
        recommendedAction: 'skip',
      };
    }

    // 2. Find candidates using title bucket
    const candidates = this.getCandidates(article.title);
    if (candidates.length === 0) {
      return {
        isDuplicate: false,
        matchedArticles: [],
        recommendedAction: 'store_new',
      };
    }

    // 3. Calculate similarity with candidates
    const matches: SimilarityMatch[] = [];

    for (const candidateId of candidates.slice(0, this.config.maxComparisons)) {
      const candidate = this.articleIndex.get(candidateId);
      if (!candidate) continue;

      // Quick pre-filter with Jaccard
      const jaccardScore = this.similarity.jaccardSimilarity(
        article.title,
        candidate.title
      );

      // Skip if clearly not similar
      if (jaccardScore < 0.3) continue;

      // Precise similarity with cosine
      const similarity = this.similarity.calculateCombinedSimilarity(
        article.title,
        article.content || '',
        candidate.title,
        candidate.content || ''
      );

      if (similarity >= this.config.relatedThreshold) {
        matches.push({
          articleId: candidateId,
          title: candidate.title,
          score: similarity,
          matchType: this.getMatchType(similarity),
        });
      }
    }

    // Sort by similarity
    matches.sort((a, b) => b.score - a.score);

    // Determine action
    if (matches.length === 0) {
      return {
        isDuplicate: false,
        matchedArticles: [],
        recommendedAction: 'store_new',
      };
    }

    const topMatch = matches[0];

    if (topMatch.score >= this.config.exactMatchThreshold) {
      return {
        isDuplicate: true,
        matchedArticles: matches,
        recommendedAction: 'skip',
      };
    }

    if (topMatch.score >= this.config.nearMatchThreshold) {
      // Check if existing article has a cluster
      const existingArticle = await Article.findById(topMatch.articleId)
        .select('clusterId')
        .lean();

      return {
        isDuplicate: false,
        existingClusterId: existingArticle?.clusterId,
        matchedArticles: matches,
        recommendedAction: existingArticle?.clusterId 
          ? 'add_to_cluster' 
          : 'create_cluster',
      };
    }

    return {
      isDuplicate: false,
      matchedArticles: matches,
      recommendedAction: 'store_new',
    };
  }

  /**
   * Get candidate articles for comparison
   */
  private getCandidates(title: string): string[] {
    const candidates: Set<string> = new Set();

    // Get candidates from title bucket
    const firstWord = this.getFirstSignificantWord(title);
    const bucket = this.titleIndex.get(firstWord) || [];
    bucket.forEach(id => candidates.add(id));

    // Also check similar buckets using n-grams
    const titleNgrams = title.toLowerCase().split(' ').slice(0, 3);
    for (const ngram of titleNgrams) {
      if (ngram.length > 3) {
        const nearBucket = this.titleIndex.get(ngram) || [];
        nearBucket.forEach(id => candidates.add(id));
      }
    }

    return Array.from(candidates);
  }

  /**
   * Classify match type based on similarity score
   */
  private getMatchType(score: number): 'exact' | 'near' | 'related' {
    if (score >= this.config.exactMatchThreshold) return 'exact';
    if (score >= this.config.nearMatchThreshold) return 'near';
    return 'related';
  }

  /**
   * Run full clustering on recent articles
   */
  async runClustering(): Promise<ClusteringResult> {
    const startTime = Date.now();
    logger.info('=== Starting Article Clustering ===');

    // Initialize indexes
    await this.initialize();

    const articles = Array.from(this.articleIndex.values());
    const uf = new UnionFind();

    // Compare all pairs and build clusters
    let comparisons = 0;
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const candidates = this.getCandidates(article.title);

      for (const candidateId of candidates) {
        if (candidateId === article.id) continue;
        if (candidateId <= article.id) continue; // Avoid duplicate comparisons

        const candidate = this.articleIndex.get(candidateId);
        if (!candidate) continue;

        // Quick Jaccard filter
        const jaccardScore = this.similarity.jaccardSimilarity(
          article.title,
          candidate.title
        );
        if (jaccardScore < 0.3) continue;

        // Precise cosine similarity
        const similarity = this.similarity.calculateCombinedSimilarity(
          article.title,
          article.content || '',
          candidate.title,
          candidate.content || ''
        );

        if (similarity >= this.config.nearMatchThreshold) {
          uf.union(article.id, candidateId);
        }

        comparisons++;
      }

      // Progress logging
      if ((i + 1) % 100 === 0) {
        logger.debug(`Processed ${i + 1}/${articles.length} articles, ${comparisons} comparisons`);
      }
    }

    // Extract clusters
    const clusters = uf.getClusters();
    let clustersCreated = 0;
    let clustersUpdated = 0;
    let articlesAssigned = 0;

    for (const [_, memberIds] of clusters) {
      if (memberIds.length < 2) continue; // Skip singletons

      // Get full article data
      const members = memberIds
        .map(id => this.articleIndex.get(id))
        .filter((a): a is ArticleForDedup => !!a);

      // Build cluster
      const cluster = await this.buildCluster(members);
      
      // Update articles with cluster ID
      const updated = await Article.updateMany(
        { _id: { $in: memberIds } },
        { clusterId: cluster.clusterId }
      );

      articlesAssigned += updated.modifiedCount;
      clustersCreated++;
    }

    const processingTimeMs = Date.now() - startTime;
    
    logger.info(
      `=== Clustering Complete: ${clustersCreated} clusters, ` +
      `${articlesAssigned} articles assigned, ${comparisons} comparisons, ` +
      `${processingTimeMs}ms ===`
    );

    return {
      totalArticles: articles.length,
      clustersCreated,
      clustersUpdated,
      articlesAssigned,
      processingTimeMs,
    };
  }

  /**
   * Build cluster data structure and select canonical article
   */
  private async buildCluster(members: ArticleForDedup[]): Promise<ArticleCluster> {
    // Generate cluster ID
    const clusterId = this.generateClusterId(members);

    // Score each member to find best source
    const scored = members.map(member => ({
      member,
      quality: this.calculateSourceQuality(member, members),
    }));

    // Sort by quality score
    scored.sort((a, b) => b.quality.totalScore - a.quality.totalScore);

    const canonical = scored[0].member;

    // Calculate similarity to canonical for each member
    const clusterMembers: ClusterMember[] = members.map(member => ({
      articleId: member.id,
      title: member.title,
      sourceUrl: member.sourceUrl,
      sourceName: member.sourceName,
      publishedAt: member.publishedAt,
      similarityToCanonical: member.id === canonical.id
        ? 1.0
        : this.similarity.calculateCombinedSimilarity(
            canonical.title,
            canonical.content || '',
            member.title,
            member.content || ''
          ),
      isCanonical: member.id === canonical.id,
    }));

    // Sort by publish date
    const sortedByDate = [...members].sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
    );

    const averageScore = members.reduce((sum, m) => sum + (m.score || 0), 0) / members.length;

    return {
      clusterId,
      canonicalArticleId: canonical.id,
      canonicalTitle: canonical.title,
      articles: clusterMembers,
      sourceCount: members.length,
      firstPublished: sortedByDate[0].publishedAt,
      lastUpdated: sortedByDate[sortedByDate.length - 1].publishedAt,
      mergedSources: members.map(m => m.sourceName),
      averageScore,
    };
  }

  /**
   * Calculate source quality score for canonical selection
   */
  private calculateSourceQuality(
    article: ArticleForDedup,
    clusterMembers: ArticleForDedup[]
  ): SourceQuality {
    // Sort by publish date to check if this was first
    const sorted = [...clusterMembers].sort(
      (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
    );
    const publishedFirst = sorted[0].id === article.id;

    const authorityScore = SOURCE_AUTHORITY[article.sourceName] || 50;
    const contentLength = Math.min(100, (article.content?.length || 0) / 50);
    const hasImage = false; // Would need imageUrl field
    const engagementScore = Math.min(100,
      Math.log10((article.viewCount || 0) + 1) * 20 +
      Math.log10((article.bookmarkCount || 0) + 1) * 30
    );

    // Weighted total score
    const totalScore =
      authorityScore * 0.40 +        // Source reputation
      contentLength * 0.25 +          // Content quality
      (publishedFirst ? 15 : 0) +     // First to publish bonus
      engagementScore * 0.20;         // User engagement

    return {
      sourceName: article.sourceName,
      authorityScore,
      contentLength,
      hasImage,
      publishedFirst,
      engagementScore,
      totalScore,
    };
  }

  /**
   * Generate deterministic cluster ID from member IDs
   */
  private generateClusterId(members: ArticleForDedup[]): string {
    const sortedIds = members.map(m => m.id).sort().join('|');
    return crypto.createHash('md5').update(sortedIds).digest('hex').substring(0, 16);
  }

  /**
   * Normalize URL for comparison
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`
        .replace(/\/+$/, '')
        .toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Get first significant word from title
   */
  private getFirstSignificantWord(title: string): string {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'this', 'that',
      'new', 'how', 'why', 'what', 'when', 'where', 'who',
    ]);

    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return words[0] || title.substring(0, 5).toLowerCase();
  }

  /**
   * Get cluster by ID
   */
  async getCluster(clusterId: string): Promise<ArticleCluster | null> {
    const articles = await Article.find({ clusterId })
      .select('_id title content sourceUrl sourceName publishedAt score viewCount bookmarkCount')
      .sort({ score: -1 })
      .lean();

    if (articles.length === 0) return null;

    const members: ArticleForDedup[] = articles.map(a => ({
      id: String(a._id),
      title: a.title,
      content: a.content,
      sourceUrl: a.sourceUrl,
      sourceName: a.sourceName,
      publishedAt: new Date(a.publishedAt),
      score: a.score,
      viewCount: a.viewCount,
      bookmarkCount: a.bookmarkCount,
    }));

    return this.buildCluster(members);
  }

  /**
   * Get all clusters with their articles
   */
  async getAllClusters(limit = 50): Promise<ArticleCluster[]> {
    // Get distinct cluster IDs
    const clusterIds = await Article.distinct('clusterId', {
      clusterId: { $exists: true, $ne: null },
    });

    const clusters: ArticleCluster[] = [];

    for (const clusterId of clusterIds.slice(0, limit)) {
      const cluster = await this.getCluster(clusterId as string);
      if (cluster && cluster.sourceCount >= 2) {
        clusters.push(cluster);
      }
    }

    // Sort by source count
    clusters.sort((a, b) => b.sourceCount - a.sourceCount);

    return clusters;
  }
}

export const clusteringService = new ClusteringService();
export default clusteringService;

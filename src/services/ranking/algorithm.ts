/**
 * Tech News Ranking Algorithm
 * 
 * Selects top 10 most important tech stories using weighted multi-factor scoring.
 * 
 * ## Algorithm Design
 * 
 * ### Ranking Factors (5 signals):
 * 1. **Source Coverage** (20%): Stories covered by multiple sources are more significant
 * 2. **Keyword Relevance** (25%): AI, security, startups, programming topics prioritized
 * 3. **Recency** (25%): Exponential decay with 12-hour half-life
 * 4. **Engagement** (20%): HN score + internal views/bookmarks
 * 5. **Source Authority** (10%): Trusted sources get credibility boost
 * 
 * ### Normalization:
 * - All signals normalized to 0-1 scale
 * - Log scaling for engagement to prevent viral articles dominating
 * - Sigmoid for keyword relevance to cap diminishing returns
 * 
 * ### Final Score:
 * score = Σ(normalized_signal × weight) × category_boost
 */

import {
  RawSignals,
  NormalizedSignals,
  RankingWeights,
  RankingResult,
  RankingConfig,
} from './types';

/**
 * Default ranking configuration
 */
export const DEFAULT_CONFIG: RankingConfig = {
  weights: {
    sourceWeight: 0.20,      // Multi-source coverage
    keywordWeight: 0.25,     // Topic relevance
    recencyWeight: 0.25,     // Freshness
    engagementWeight: 0.20,  // Popularity
    authorityWeight: 0.10,   // Source trust
  },

  recencyHalfLifeHours: 12,  // Score drops 50% every 12 hours
  maxArticleAgeHours: 72,    // Don't consider articles older than 3 days

  // Category boost multipliers
  categoryBoosts: {
    ai: 1.25,           // AI/ML stories prioritized
    security: 1.15,     // Security is always relevant
    startups: 1.10,     // Startup news
    programming: 1.05,  // Developer content
    devtools: 1.05,     // Tools and infrastructure
    mobile: 1.00,       // Mobile tech
    hardware: 0.95,     // Hardware news
    tech: 0.90,         // General tech
    other: 0.80,        // Misc
  },

  // Source authority scores (0-100)
  sourceAuthorityMap: {
    // Tier 1: Original sources & research
    'OpenAI Blog': 98,
    'Google AI Blog': 98,
    'Microsoft Research': 95,
    'MIT Technology Review': 95,
    'GitHub Blog': 95,
    'Anthropic Blog': 95,
    'DeepMind Blog': 95,

    // Tier 2: Quality tech journalism
    'TechCrunch': 85,
    'The Verge': 82,
    'Ars Technica': 88,
    'Wired': 80,
    'Engadget': 75,
    'VentureBeat': 78,

    // Tier 3: Security sources
    'Krebs on Security': 92,
    'Schneier on Security': 90,
    'Security Week': 80,
    'BleepingComputer': 78,

    // Tier 4: Community sources
    'Hacker News': 70,
    'Reddit r/programming': 60,
    'DEV Community': 55,
    'Lobsters': 65,

    // Tier 5: GitHub Trending
    'GitHub Trending': 75,
  },

  // Keyword relevance weights
  keywordWeights: {
    // High priority (weight: 3)
    'artificial intelligence': 3,
    'machine learning': 3,
    'ai': 3,
    'llm': 3,
    'gpt': 3,
    'chatgpt': 3,
    'large language model': 3,
    'neural network': 3,
    'deep learning': 3,
    'openai': 3,
    'anthropic': 3,
    'gemini': 3,
    'claude': 3,

    // Medium-high priority (weight: 2.5)
    'security': 2.5,
    'vulnerability': 2.5,
    'data breach': 2.5,
    'ransomware': 2.5,
    'cybersecurity': 2.5,
    'zero-day': 2.5,
    'encryption': 2.5,

    // Medium priority (weight: 2)
    'startup': 2,
    'funding': 2,
    'series a': 2,
    'series b': 2,
    'acquisition': 2,
    'ipo': 2,
    'unicorn': 2,
    'ycombinator': 2,
    'y combinator': 2,

    // Standard priority (weight: 1.5)
    'programming': 1.5,
    'developer': 1.5,
    'software': 1.5,
    'open source': 1.5,
    'api': 1.5,
    'framework': 1.5,
    'typescript': 1.5,
    'rust': 1.5,
    'python': 1.5,
    'javascript': 1.5,
    'golang': 1.5,
    'kubernetes': 1.5,
    'docker': 1.5,

    // Lower priority (weight: 1)
    'cloud': 1,
    'aws': 1,
    'azure': 1,
    'google cloud': 1,
    'saas': 1,
    'infrastructure': 1,
    'database': 1,
    'blockchain': 1,
    'crypto': 1,
    'web3': 1,
  },
};

/**
 * Core ranking algorithm
 */
export class RankingAlgorithm {
  private config: RankingConfig;

  constructor(config: Partial<RankingConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
      categoryBoosts: { ...DEFAULT_CONFIG.categoryBoosts, ...config.categoryBoosts },
      sourceAuthorityMap: { ...DEFAULT_CONFIG.sourceAuthorityMap, ...config.sourceAuthorityMap },
      keywordWeights: { ...DEFAULT_CONFIG.keywordWeights, ...config.keywordWeights },
    };

    // Validate weights sum to 1.0
    const weightSum = Object.values(this.config.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 0.001) {
      throw new Error(`Ranking weights must sum to 1.0, got ${weightSum}`);
    }
  }

  /**
   * Collect raw signals from article data
   */
  collectSignals(article: {
    title: string;
    content?: string;
    tags?: string[];
    sourceName: string;
    categorySlug: string;
    publishedAt: Date;
    viewCount?: number;
    bookmarkCount?: number;
    hnScore?: number;
    relatedArticleCount?: number;
  }): RawSignals {
    const now = new Date();
    const ageHours = (now.getTime() - article.publishedAt.getTime()) / (1000 * 60 * 60);

    // Extract keywords from title, content, and tags
    const textToSearch = [
      article.title,
      article.content?.substring(0, 2000) || '',
      ...(article.tags || []),
    ].join(' ').toLowerCase();

    const matchedKeywords = this.extractMatchedKeywords(textToSearch);
    const sourceAuthority = this.config.sourceAuthorityMap[article.sourceName] || 50;
    const categoryMultiplier = this.config.categoryBoosts[article.categorySlug] || 1.0;

    return {
      sourceCount: article.relatedArticleCount || 1,
      hnScore: article.hnScore || 0,
      ageHours,
      viewCount: article.viewCount || 0,
      bookmarkCount: article.bookmarkCount || 0,
      matchedKeywords,
      sourceAuthority,
      categoryMultiplier,
    };
  }

  /**
   * Extract matching keywords and their weights
   */
  private extractMatchedKeywords(text: string): string[] {
    const matched: string[] = [];
    
    for (const keyword of Object.keys(this.config.keywordWeights)) {
      if (text.includes(keyword)) {
        matched.push(keyword);
      }
    }

    return matched;
  }

  /**
   * Normalize all signals to 0-1 scale
   */
  normalizeSignals(raw: RawSignals): NormalizedSignals {
    return {
      sourceScore: this.normalizeSourceCount(raw.sourceCount),
      keywordScore: this.normalizeKeywordRelevance(raw.matchedKeywords),
      recencyScore: this.normalizeRecency(raw.ageHours),
      engagementScore: this.normalizeEngagement(raw.hnScore, raw.viewCount, raw.bookmarkCount),
      authorityScore: this.normalizeAuthority(raw.sourceAuthority),
    };
  }

  /**
   * Normalize source count (more sources = more important)
   * Uses logarithmic scaling with diminishing returns
   */
  private normalizeSourceCount(count: number): number {
    // 1 source = 0.2, 2 sources = 0.5, 3+ = 0.7-1.0
    if (count <= 1) return 0.2;
    if (count === 2) return 0.5;
    // Log scaling for 3+ sources
    return Math.min(1.0, 0.5 + Math.log10(count) * 0.5);
  }

  /**
   * Normalize keyword relevance using weighted keyword matching
   * Sigmoid function to cap diminishing returns
   */
  private normalizeKeywordRelevance(matchedKeywords: string[]): number {
    if (matchedKeywords.length === 0) return 0.1; // Minimum score

    // Sum up keyword weights
    let totalWeight = 0;
    for (const keyword of matchedKeywords) {
      totalWeight += this.config.keywordWeights[keyword] || 1;
    }

    // Sigmoid normalization: maps any value to 0-1
    // f(x) = 1 / (1 + e^(-k*(x-m)))
    // k = steepness, m = midpoint
    const k = 0.3;  // Steepness
    const m = 5;    // Midpoint (5 weight points = 0.5 score)
    const sigmoid = 1 / (1 + Math.exp(-k * (totalWeight - m)));

    return Math.max(0.1, Math.min(1.0, sigmoid));
  }

  /**
   * Normalize recency using exponential decay
   * Half-life decay model: score = 0.5^(age / halfLife)
   */
  private normalizeRecency(ageHours: number): number {
    // Articles older than max age get minimum score
    if (ageHours > this.config.maxArticleAgeHours) {
      return 0.01;
    }

    // Exponential decay
    const halfLife = this.config.recencyHalfLifeHours;
    const decayScore = Math.pow(0.5, ageHours / halfLife);

    return Math.max(0.01, decayScore);
  }

  /**
   * Normalize engagement signals (HN score + internal metrics)
   * Log scaling to prevent viral articles from dominating
   */
  private normalizeEngagement(
    hnScore: number,
    viewCount: number,
    bookmarkCount: number
  ): number {
    // HN score: log10 scaling, max contribution 0.6
    // Typical HN top stories: 100-500 points
    const hnNormalized = Math.min(0.6, Math.log10(hnScore + 1) * 0.2);

    // View count: log scaling, max contribution 0.25
    const viewNormalized = Math.min(0.25, Math.log10(viewCount + 1) * 0.1);

    // Bookmark count: higher signal quality, max contribution 0.15
    const bookmarkNormalized = Math.min(0.15, Math.log10(bookmarkCount + 1) * 0.1);

    const total = hnNormalized + viewNormalized + bookmarkNormalized;
    return Math.max(0.05, Math.min(1.0, total));
  }

  /**
   * Normalize source authority (already 0-100, convert to 0-1)
   */
  private normalizeAuthority(authority: number): number {
    return Math.max(0.1, Math.min(1.0, authority / 100));
  }

  /**
   * Compute final ranking score
   */
  computeScore(
    normalized: NormalizedSignals,
    categoryMultiplier: number
  ): { componentScores: RankingResult['componentScores']; finalScore: number } {
    const { weights } = this.config;

    // Calculate weighted component scores
    const componentScores = {
      source: normalized.sourceScore * weights.sourceWeight,
      keyword: normalized.keywordScore * weights.keywordWeight,
      recency: normalized.recencyScore * weights.recencyWeight,
      engagement: normalized.engagementScore * weights.engagementWeight,
      authority: normalized.authorityScore * weights.authorityWeight,
    };

    // Sum components
    const baseScore = 
      componentScores.source +
      componentScores.keyword +
      componentScores.recency +
      componentScores.engagement +
      componentScores.authority;

    // Apply category boost
    const finalScore = baseScore * categoryMultiplier;

    return {
      componentScores,
      finalScore: Math.round(finalScore * 10000) / 10000, // 4 decimal places
    };
  }

  /**
   * Full ranking pipeline for a single article
   */
  rankArticle(article: {
    _id: string;
    title: string;
    content?: string;
    tags?: string[];
    sourceName: string;
    categorySlug: string;
    publishedAt: Date;
    viewCount?: number;
    bookmarkCount?: number;
    hnScore?: number;
    relatedArticleCount?: number;
  }): RankingResult {
    // Step 1: Collect raw signals
    const rawSignals = this.collectSignals(article);

    // Step 2: Normalize signals
    const normalizedSignals = this.normalizeSignals(rawSignals);

    // Step 3: Compute final score
    const { componentScores, finalScore } = this.computeScore(
      normalizedSignals,
      rawSignals.categoryMultiplier
    );

    return {
      articleId: article._id,
      title: article.title,
      rawSignals,
      normalizedSignals,
      componentScores,
      finalScore,
    };
  }

  /**
   * Rank multiple articles and select top N
   */
  selectTopArticles(
    articles: Array<{
      _id: string;
      title: string;
      content?: string;
      tags?: string[];
      sourceName: string;
      categorySlug: string;
      publishedAt: Date;
      viewCount?: number;
      bookmarkCount?: number;
      hnScore?: number;
      relatedArticleCount?: number;
    }>,
    topN: number = 10
  ): RankingResult[] {
    // Rank all articles
    const ranked = articles.map((article) => this.rankArticle(article));

    // Sort by final score (descending)
    ranked.sort((a, b) => b.finalScore - a.finalScore);

    // Assign ranks and return top N
    return ranked.slice(0, topN).map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
  }
}

// Export singleton instance with default config
export const rankingAlgorithm = new RankingAlgorithm();
export default RankingAlgorithm;

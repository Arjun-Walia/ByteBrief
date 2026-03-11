/**
 * Ranking Algorithm Types
 * 
 * Defines the scoring system for selecting top tech stories.
 */

/**
 * Raw signals collected for an article before normalization
 */
export interface RawSignals {
  /** Number of sources reporting the same story */
  sourceCount: number;
  /** Hacker News score (upvotes) */
  hnScore: number;
  /** Hours since publication */
  ageHours: number;
  /** Internal engagement: views */
  viewCount: number;
  /** Internal engagement: bookmarks */
  bookmarkCount: number;
  /** Keywords matched from article */
  matchedKeywords: string[];
  /** Source authority score (0-100) */
  sourceAuthority: number;
  /** Category relevance multiplier */
  categoryMultiplier: number;
}

/**
 * Normalized signals (0-1 scale)
 */
export interface NormalizedSignals {
  sourceScore: number;      // Multi-source coverage
  keywordScore: number;     // Relevance to tech topics
  recencyScore: number;     // Time decay
  engagementScore: number;  // HN + internal signals
  authorityScore: number;   // Source credibility
}

/**
 * Weights for each ranking factor (must sum to 1.0)
 */
export interface RankingWeights {
  sourceWeight: number;     // Multi-source coverage (0.20)
  keywordWeight: number;    // Topic relevance (0.25)
  recencyWeight: number;    // Freshness (0.25)
  engagementWeight: number; // Popularity signals (0.20)
  authorityWeight: number;  // Source trust (0.10)
}

/**
 * Final computed ranking result for an article
 */
export interface RankingResult {
  articleId: string;
  title: string;
  rawSignals: RawSignals;
  normalizedSignals: NormalizedSignals;
  componentScores: {
    source: number;
    keyword: number;
    recency: number;
    engagement: number;
    authority: number;
  };
  finalScore: number;
  rank?: number;
}

/**
 * Configuration for the ranking algorithm
 */
export interface RankingConfig {
  weights: RankingWeights;
  recencyHalfLifeHours: number;
  maxArticleAgeHours: number;
  categoryBoosts: Record<string, number>;
  sourceAuthorityMap: Record<string, number>;
  keywordWeights: Record<string, number>;
}

/**
 * Result of a ranking job
 */
export interface RankingJobResult {
  timestamp: Date;
  articlesProcessed: number;
  articlesRanked: number;
  topArticles: RankingResult[];
  processingTimeMs: number;
}

/**
 * Daily feed selection
 */
export interface DailyFeed {
  date: string;           // YYYY-MM-DD
  generatedAt: Date;
  articles: RankingResult[];
  totalCandidates: number;
}

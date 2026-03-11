/**
 * Duplicate Detection System Types
 * 
 * Defines structures for article clustering and source merging.
 */

/**
 * Article data for duplicate detection
 */
export interface ArticleForDedup {
  id: string;
  title: string;
  content?: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: Date;
  score?: number;
  viewCount?: number;
  bookmarkCount?: number;
}

/**
 * TF-IDF vector representation
 */
export interface TFIDFVector {
  terms: Map<string, number>;
  magnitude: number;
}

/**
 * Similarity comparison result
 */
export interface SimilarityMatch {
  articleId: string;
  title: string;
  score: number;
  matchType: 'exact' | 'near' | 'related';
}

/**
 * Cluster of related articles (same story, different sources)
 */
export interface ArticleCluster {
  clusterId: string;
  canonicalArticleId: string;
  canonicalTitle: string;
  articles: ClusterMember[];
  sourceCount: number;
  firstPublished: Date;
  lastUpdated: Date;
  mergedSources: string[];
  averageScore: number;
}

/**
 * Member of an article cluster
 */
export interface ClusterMember {
  articleId: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: Date;
  similarityToCanonical: number;
  isCanonical: boolean;
}

/**
 * Source quality metrics for best source selection
 */
export interface SourceQuality {
  sourceName: string;
  authorityScore: number;
  contentLength: number;
  hasImage: boolean;
  publishedFirst: boolean;
  engagementScore: number;
  totalScore: number;
}

/**
 * Result of duplicate detection
 */
export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  existingClusterId?: string;
  matchedArticles: SimilarityMatch[];
  recommendedAction: 'skip' | 'add_to_cluster' | 'create_cluster' | 'store_new';
}

/**
 * Clustering job result
 */
export interface ClusteringResult {
  totalArticles: number;
  clustersCreated: number;
  clustersUpdated: number;
  articlesAssigned: number;
  processingTimeMs: number;
}

/**
 * Configuration for duplicate detection
 */
export interface DuplicateDetectionConfig {
  /** Threshold for exact duplicate (0.95+) */
  exactMatchThreshold: number;
  /** Threshold for near duplicate (0.80+) */
  nearMatchThreshold: number;
  /** Threshold for related stories (0.60+) */
  relatedThreshold: number;
  /** Minimum content length for comparison */
  minContentLength: number;
  /** Maximum articles to compare against */
  maxComparisons: number;
  /** Time window for clustering (hours) */
  clusterTimeWindowHours: number;
}

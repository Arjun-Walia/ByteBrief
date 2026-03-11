/**
 * Raw article from any source before normalization and deduplication
 */
export interface RawArticle {
  title: string;
  url: string;
  content: string;
  summary: string;
  sourceName: string;
  sourceId: string;
  author?: string;
  imageUrl?: string;
  publishedAt: Date;
  categories: string[];
  metadata?: Record<string, unknown>;
  raw?: unknown;
}

/**
 * Processed article ready for storage
 */
export interface ProcessedArticle {
  title: string;
  summary: string;
  content: string;
  sourceUrl: string;
  sourceName: string;
  sourceId: string;
  imageUrl?: string;
  categorySlug: string;
  tags: string[];
  author?: string;
  publishedAt: Date;
  fingerprint: string;
  readTime: number;
}

/**
 * Ingestion result statistics
 */
export interface IngestionResult {
  source: string;
  fetched: number;
  new: number;
  duplicates: number;
  errors: number;
  duration: number;
}

/**
 * Overall ingestion run result
 */
export interface IngestionRunResult {
  startTime: Date;
  endTime: Date;
  totalFetched: number;
  totalNew: number;
  totalDuplicates: number;
  totalErrors: number;
  sourceResults: IngestionResult[];
}

/**
 * Similarity check result
 */
export interface SimilarityResult {
  isDuplicate: boolean;
  similarityScore: number;
  matchedArticleId?: string;
  matchedUrl?: string;
  matchType: 'url' | 'title' | 'content' | 'none';
}

/**
 * Tech news filter result
 */
export interface TechFilterResult {
  isTech: boolean;
  score: number;
  matchedKeywords: string[];
}

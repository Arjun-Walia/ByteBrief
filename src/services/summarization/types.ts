/**
 * Summarization Pipeline Types
 */

/**
 * Structured summary output format
 */
export interface ArticleSummary {
  /** Optimized title (may be improved from original) */
  title: string;
  /** 3-sentence summary, max 60 words total */
  summary: string;
  /** Why this matters to readers (1-2 sentences) */
  whyItMatters: string;
}

/**
 * Input for summarization
 */
export interface SummarizationInput {
  articleId: string;
  originalTitle: string;
  content: string;
  category?: string;
}

/**
 * Result from summarization
 */
export interface SummarizationResult {
  articleId: string;
  success: boolean;
  summary?: ArticleSummary;
  error?: string;
  tokensUsed?: TokenUsage;
  processingTime: number;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/**
 * Batch processing result
 */
export interface BatchResult {
  totalArticles: number;
  successful: number;
  failed: number;
  skipped: number;
  totalTokensUsed: number;
  totalCost: number;
  processingTime: number;
  results: SummarizationResult[];
}

/**
 * AI Provider options
 */
export type AIProvider = 'openai' | 'anthropic';

/**
 * AI Model configuration
 */
export interface ModelConfig {
  provider: AIProvider;
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  temperature: number;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  batchSize: number;
  concurrency: number;
  retryConfig: RetryConfig;
  modelConfig: ModelConfig;
}

/**
 * Summarization Pipeline
 * 
 * Orchestrates the complete summarization workflow:
 * - Processes newly ingested articles
 * - Batches requests for efficiency
 * - Stores summaries in MongoDB
 * - Avoids reprocessing
 */

import { Article } from '../../models';
import { logger } from '../../utils/logger';
import { AIClient } from './aiClient';
import {
  SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT,
  generateUserPrompt,
  generateBatchPrompt,
  validateContent,
  estimateTokens,
} from './prompts';
import {
  SummarizationInput,
  SummarizationResult,
  BatchResult,
  ArticleSummary,
  PipelineConfig,
} from './types';

// Default pipeline configuration
const DEFAULT_CONFIG: PipelineConfig = {
  batchSize: 5,        // Articles per batch (balances efficiency vs risk)
  concurrency: 2,      // Parallel batches
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: ['rate_limit', 'timeout', '429', '500', '502', '503'],
  },
  modelConfig: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.00015 / 1000,
    costPerOutputToken: 0.0006 / 1000,
    temperature: 0.3,
    rateLimit: {
      requestsPerMinute: 500,
      tokensPerMinute: 200000,
    },
  },
};

/**
 * Main Summarization Pipeline
 */
export class SummarizationPipeline {
  private aiClient: AIClient;
  private config: PipelineConfig;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = new AIClient();
  }

  /**
   * Process a single article
   */
  async summarizeArticle(input: SummarizationInput): Promise<SummarizationResult> {
    const startTime = Date.now();

    // Validate content
    const validation = validateContent(input.content);
    if (!validation.valid) {
      return {
        articleId: input.articleId,
        success: false,
        error: validation.reason,
        processingTime: Date.now() - startTime,
      };
    }

    try {
      // Check if AI client is available
      if (!this.aiClient.isAvailable()) {
        // Use fallback summarization
        const fallbackSummary = this.fallbackSummarize(input);
        return {
          articleId: input.articleId,
          success: true,
          summary: fallbackSummary,
          processingTime: Date.now() - startTime,
        };
      }

      // Generate prompts
      const userPrompt = generateUserPrompt(
        input.originalTitle,
        input.content,
        input.category
      );

      // Call AI
      const response = await this.aiClient.generateSummary(
        SYSTEM_PROMPT,
        userPrompt
      );

      return {
        articleId: input.articleId,
        success: true,
        summary: response.summary,
        tokensUsed: response.usage,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`Summarization failed for ${input.articleId}:`, error);
      
      // Try fallback on failure
      try {
        const fallbackSummary = this.fallbackSummarize(input);
        return {
          articleId: input.articleId,
          success: true,
          summary: fallbackSummary,
          error: `AI failed, used fallback: ${(error as Error).message}`,
          processingTime: Date.now() - startTime,
        };
      } catch {
        return {
          articleId: input.articleId,
          success: false,
          error: (error as Error).message,
          processingTime: Date.now() - startTime,
        };
      }
    }
  }

  /**
   * Process a batch of articles
   * More token-efficient than individual calls
   */
  async summarizeBatch(inputs: SummarizationInput[]): Promise<BatchResult> {
    const startTime = Date.now();
    const results: SummarizationResult[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // Validate inputs and filter out invalid ones
    const validInputs: SummarizationInput[] = [];
    for (const input of inputs) {
      const validation = validateContent(input.content);
      if (!validation.valid) {
        results.push({
          articleId: input.articleId,
          success: false,
          error: validation.reason,
          processingTime: 0,
        });
        skipped++;
      } else {
        validInputs.push(input);
      }
    }

    // If no AI available, use fallback for all
    if (!this.aiClient.isAvailable()) {
      for (const input of validInputs) {
        const summary = this.fallbackSummarize(input);
        results.push({
          articleId: input.articleId,
          success: true,
          summary,
          processingTime: 0,
        });
        successful++;
      }
      return {
        totalArticles: inputs.length,
        successful,
        failed,
        skipped,
        totalTokensUsed: 0,
        totalCost: 0,
        processingTime: Date.now() - startTime,
        results,
      };
    }

    // Process in smaller batches to avoid token limits
    const batches = this.chunkArray(validInputs, this.config.batchSize);
    
    for (const batch of batches) {
      try {
        // For small batches, process individually (more reliable)
        if (batch.length <= 2) {
          for (const input of batch) {
            const result = await this.summarizeArticle(input);
            results.push(result);
            if (result.success) {
              successful++;
              if (result.tokensUsed) {
                totalTokens += result.tokensUsed.totalTokens;
                totalCost += result.tokensUsed.estimatedCost;
              }
            } else {
              failed++;
            }
          }
          continue;
        }

        // Process batch together
        const batchPrompt = generateBatchPrompt(
          batch.map((b) => ({
            id: b.articleId,
            title: b.originalTitle,
            content: b.content,
            category: b.category,
          }))
        );

        const response = await this.aiClient.generateSummary(
          BATCH_SYSTEM_PROMPT,
          batchPrompt
        );

        // Parse batch response
        const batchSummaries = this.parseBatchResponse(response.summary, batch);
        
        for (const input of batch) {
          const summary = batchSummaries.get(input.articleId);
          if (summary) {
            results.push({
              articleId: input.articleId,
              success: true,
              summary,
              tokensUsed: {
                promptTokens: Math.floor(
                  (response.usage.promptTokens || 0) / batch.length
                ),
                completionTokens: Math.floor(
                  (response.usage.completionTokens || 0) / batch.length
                ),
                totalTokens: Math.floor(
                  (response.usage.totalTokens || 0) / batch.length
                ),
                estimatedCost: (response.usage.estimatedCost || 0) / batch.length,
              },
              processingTime: Date.now() - startTime,
            });
            successful++;
          } else {
            // Failed to get summary from batch, try individual
            const fallback = this.fallbackSummarize(input);
            results.push({
              articleId: input.articleId,
              success: true,
              summary: fallback,
              error: 'Batch parse failed, used fallback',
              processingTime: Date.now() - startTime,
            });
            successful++;
          }
        }

        totalTokens += response.usage.totalTokens || 0;
        totalCost += response.usage.estimatedCost || 0;

      } catch (error) {
        logger.error('Batch summarization failed:', error);
        
        // Fallback: process individually
        for (const input of batch) {
          try {
            const fallback = this.fallbackSummarize(input);
            results.push({
              articleId: input.articleId,
              success: true,
              summary: fallback,
              error: 'Batch failed, used fallback',
              processingTime: Date.now() - startTime,
            });
            successful++;
          } catch {
            results.push({
              articleId: input.articleId,
              success: false,
              error: (error as Error).message,
              processingTime: Date.now() - startTime,
            });
            failed++;
          }
        }
      }

      // Rate limiting between batches
      await this.sleep(500);
    }

    return {
      totalArticles: inputs.length,
      successful,
      failed,
      skipped,
      totalTokensUsed: totalTokens,
      totalCost,
      processingTime: Date.now() - startTime,
      results,
    };
  }

  /**
   * Parse batch response from AI
   */
  private parseBatchResponse(
    response: ArticleSummary | { id?: string }[],
    inputs: SummarizationInput[]
  ): Map<string, ArticleSummary> {
    const summaries = new Map<string, ArticleSummary>();

    // If response is array, map by ID
    if (Array.isArray(response)) {
      for (const item of response) {
        if (item.id && typeof item === 'object') {
          const summary = item as unknown as ArticleSummary & { id: string };
          summaries.set(summary.id, {
            title: summary.title || '',
            summary: summary.summary || '',
            whyItMatters: summary.whyItMatters || (summary as any).why_it_matters || '',
          });
        }
      }
    } else if (typeof response === 'object') {
      // Single response - assign to first input
      if (inputs.length > 0) {
        summaries.set(inputs[0].articleId, response as ArticleSummary);
      }
    }

    return summaries;
  }

  /**
   * Fallback summarization without AI
   * Uses simple extraction techniques
   */
  private fallbackSummarize(input: SummarizationInput): ArticleSummary {
    const content = input.content || '';
    
    // Clean content
    const cleaned = content
      .replace(/\s+/g, ' ')
      .replace(/\[.*?\]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();

    // Extract first few sentences
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.length > 20 && s.length < 200);

    const summary = sentences.slice(0, 3).join(' ').substring(0, 300);
    
    // Generate why it matters from keywords
    const keywords = this.extractKeywords(cleaned);
    const whyItMatters = keywords.length > 0
      ? `This relates to ${keywords.slice(0, 3).join(', ')} in tech.`
      : 'This is a notable development in the tech industry.';

    return {
      title: this.cleanTitle(input.originalTitle),
      summary: summary || 'Summary not available.',
      whyItMatters,
    };
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    const techKeywords = [
      'ai', 'artificial intelligence', 'machine learning', 'startup',
      'security', 'privacy', 'cloud', 'software', 'hardware', 'app',
      'developer', 'programming', 'data', 'mobile', 'web', 'blockchain',
      'crypto', 'robotics', 'automation', 'api', 'open source',
    ];

    const lowercaseContent = content.toLowerCase();
    return techKeywords.filter((kw) => lowercaseContent.includes(kw));
  }

  /**
   * Clean up title
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\s+/g, ' ')
      .replace(/\|.*$/, '')  // Remove site name after pipe
      .replace(/-\s*[^-]*$/, '') // Remove site name after dash
      .trim()
      .substring(0, 100);
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Main service for processing unsummarized articles
 */
export class ArticleSummarizationService {
  private pipeline: SummarizationPipeline;

  constructor() {
    this.pipeline = new SummarizationPipeline();
  }

  /**
   * Find and process articles that need summarization
   */
  async processNewArticles(limit = 50): Promise<BatchResult> {
    logger.info(`Looking for up to ${limit} articles to summarize...`);

    // Find articles without AI-generated summaries
    // We identify these by checking for the aiSummary field
    const articles = await Article.find({
      $or: [
        { aiSummary: { $exists: false } },
        { 'aiSummary.summary': { $exists: false } },
        { 'aiSummary.summary': '' },
      ],
      content: { $exists: true, $ne: '' },
    })
      .select('_id title content categorySlug summary')
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();

    if (articles.length === 0) {
      logger.info('No articles need summarization');
      return {
        totalArticles: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        totalTokensUsed: 0,
        totalCost: 0,
        processingTime: 0,
        results: [],
      };
    }

    logger.info(`Found ${articles.length} articles to summarize`);

    // Convert to pipeline input format
    const inputs: SummarizationInput[] = articles.map((article) => ({
      articleId: article._id.toString(),
      originalTitle: article.title,
      content: article.content || '',
      category: article.categorySlug,
    }));

    // Process batch
    const result = await this.pipeline.summarizeBatch(inputs);

    // Store successful summaries
    let stored = 0;
    for (const res of result.results) {
      if (res.success && res.summary) {
        try {
          await Article.findByIdAndUpdate(res.articleId, {
            aiSummary: {
              title: res.summary.title,
              summary: res.summary.summary,
              whyItMatters: res.summary.whyItMatters,
              generatedAt: new Date(),
              tokensUsed: res.tokensUsed?.totalTokens || 0,
            },
            // Also update the main summary field for backward compatibility
            summary: res.summary.summary,
          });
          stored++;
        } catch (error) {
          logger.error(`Failed to store summary for ${res.articleId}:`, error);
        }
      }
    }

    logger.info(
      `Summarization complete: ${stored}/${result.successful} stored, ` +
      `${result.failed} failed, ${result.skipped} skipped, ` +
      `${result.totalTokensUsed} tokens, $${result.totalCost.toFixed(4)} cost`
    );

    return result;
  }

  /**
   * Summarize a specific article by ID
   */
  async summarizeArticleById(articleId: string): Promise<SummarizationResult> {
    const article = await Article.findById(articleId)
      .select('_id title content categorySlug')
      .lean();

    if (!article) {
      return {
        articleId,
        success: false,
        error: 'Article not found',
        processingTime: 0,
      };
    }

    const input: SummarizationInput = {
      articleId: article._id.toString(),
      originalTitle: article.title,
      content: article.content || '',
      category: article.categorySlug,
    };

    const result = await this.pipeline.summarizeArticle(input);

    // Store if successful
    if (result.success && result.summary) {
      await Article.findByIdAndUpdate(articleId, {
        aiSummary: {
          title: result.summary.title,
          summary: result.summary.summary,
          whyItMatters: result.summary.whyItMatters,
          generatedAt: new Date(),
          tokensUsed: result.tokensUsed?.totalTokens || 0,
        },
        summary: result.summary.summary,
      });
    }

    return result;
  }

  /**
   * Get token usage statistics
   */
  async getUsageStats(days = 30): Promise<{
    totalArticles: number;
    totalTokens: number;
    estimatedCost: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = await Article.aggregate([
      {
        $match: {
          'aiSummary.generatedAt': { $gte: since },
        },
      },
      {
        $group: {
          _id: null,
          totalArticles: { $sum: 1 },
          totalTokens: { $sum: '$aiSummary.tokensUsed' },
        },
      },
    ]);

    const result = stats[0] || { totalArticles: 0, totalTokens: 0 };
    
    // Estimate cost (using gpt-4o-mini pricing)
    const estimatedCost = result.totalTokens * (0.00015 / 1000 + 0.0006 / 1000) / 2;

    return {
      totalArticles: result.totalArticles,
      totalTokens: result.totalTokens,
      estimatedCost,
    };
  }
}

// Export singleton instance
export const articleSummarizationService = new ArticleSummarizationService();
export const summarizationPipeline = new SummarizationPipeline();

export default articleSummarizationService;

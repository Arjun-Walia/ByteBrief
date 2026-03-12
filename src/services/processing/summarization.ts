/**
 * Summarization Service (Backward Compatible Wrapper)
 * 
 * This module wraps the new summarization pipeline for backward compatibility.
 * For new code, use the new pipeline directly:
 * 
 * import { articleSummarizationService } from '../summarization';
 */

import { articleSummarizationService, SummarizationPipeline } from '../summarization';
import { logger } from '../../utils/logger';

/**
 * Backward compatible summarization service
 */
export class SummarizationService {
  private pipeline: SummarizationPipeline;

  constructor() {
    this.pipeline = new SummarizationPipeline();
    logger.info('SummarizationService initialized (using new pipeline)');
  }

  /**
   * Summarize a single article
   * @deprecated Use articleSummarizationService.summarizeArticleById() instead
   */
  async summarize(content: string, title: string): Promise<string> {
    const result = await this.pipeline.summarizeArticle({
      articleId: 'temp',
      originalTitle: title,
      content,
    });

    if (result.success && result.summary) {
      return result.summary.summary;
    }

    // Fallback
    return this.fallbackSummarize(content);
  }

  /**
   * Process unsummarized articles
   * @deprecated Use articleSummarizationService.processNewArticles() instead
   */
  async summarizeUnsummarizedArticles(limit = 50): Promise<number> {
    const result = await articleSummarizationService.processNewArticles(limit);
    return result.successful;
  }

  /**
   * Simple fallback summarization
   */
  private fallbackSummarize(content: string): string {
    const sentences = content
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 20);
    
    return sentences.slice(0, 2).join(' ').substring(0, 500);
  }
}

export const summarizationService = new SummarizationService();
export default summarizationService;

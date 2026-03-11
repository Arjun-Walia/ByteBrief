/**
 * Abstract AI Client with Retry Logic
 * Supports both OpenAI and Anthropic with unified interface
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  AIProvider,
  ModelConfig,
  RetryConfig,
  TokenUsage,
  ArticleSummary,
} from './types';

// Model configurations
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.00015 / 1000, // $0.15 per 1M tokens
    costPerOutputToken: 0.0006 / 1000, // $0.60 per 1M tokens
    temperature: 0.3,
    rateLimit: {
      requestsPerMinute: 500,
      tokensPerMinute: 200000,
    },
  },
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.005 / 1000,
    costPerOutputToken: 0.015 / 1000,
    temperature: 0.3,
    rateLimit: {
      requestsPerMinute: 500,
      tokensPerMinute: 150000,
    },
  },
  'claude-3-haiku-20240307': {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    maxInputTokens: 200000,
    maxOutputTokens: 4096,
    costPerInputToken: 0.00025 / 1000,
    costPerOutputToken: 0.00125 / 1000,
    temperature: 0.3,
    rateLimit: {
      requestsPerMinute: 1000,
      tokensPerMinute: 100000,
    },
  },
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    costPerInputToken: 0.003 / 1000,
    costPerOutputToken: 0.015 / 1000,
    temperature: 0.3,
    rateLimit: {
      requestsPerMinute: 1000,
      tokensPerMinute: 80000,
    },
  },
};

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'rate_limit_exceeded',
    'overloaded',
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    '429',
    '500',
    '502',
    '503',
    '504',
  ],
};

interface SummarizationResponse {
  summary: ArticleSummary;
  usage: TokenUsage;
}

/**
 * AI Client with retry logic and token optimization
 */
export class AIClient {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private modelConfig: ModelConfig;
  private retryConfig: RetryConfig;
  private requestCount = 0;
  private lastResetTime = Date.now();

  constructor(
    modelName: string = env.AI_PROVIDER === 'anthropic' 
      ? 'claude-3-haiku-20240307' 
      : 'gpt-4o-mini',
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.modelConfig = MODEL_CONFIGS[modelName] || MODEL_CONFIGS['gpt-4o-mini'];
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    // Initialize the appropriate client
    if (this.modelConfig.provider === 'openai' && env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    } else if (this.modelConfig.provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    } else {
      logger.warn(`AI provider ${this.modelConfig.provider} not configured`);
    }
  }

  /**
   * Generate summary with retry logic
   */
  async generateSummary(
    systemPrompt: string,
    userPrompt: string
  ): Promise<SummarizationResponse> {
    await this.checkRateLimit();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        if (this.modelConfig.provider === 'openai' && this.openai) {
          return await this.callOpenAI(systemPrompt, userPrompt);
        } else if (this.modelConfig.provider === 'anthropic' && this.anthropic) {
          return await this.callAnthropic(systemPrompt, userPrompt);
        } else {
          throw new Error('No AI provider available');
        }
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retryConfig.maxRetries && this.isRetryable(error)) {
          const delay = this.calculateBackoff(attempt);
          logger.warn(
            `AI request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), ` +
            `retrying in ${delay}ms: ${(error as Error).message}`
          );
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('AI request failed');
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string
  ): Promise<SummarizationResponse> {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const response = await this.openai.chat.completions.create({
      model: this.modelConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.modelConfig.maxOutputTokens,
      temperature: this.modelConfig.temperature,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = this.parseJSONResponse(content);
    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      estimatedCost: this.calculateCost(
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0
      ),
    };

    this.requestCount++;
    return { summary: parsed, usage };
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string
  ): Promise<SummarizationResponse> {
    if (!this.anthropic) throw new Error('Anthropic not initialized');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.anthropic as any;
    const response = await client.messages.create({
      model: this.modelConfig.model,
      max_tokens: this.modelConfig.maxOutputTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(
      (block: { type: string }) => block.type === 'text'
    ) as { type: 'text'; text: string } | undefined;

    if (!textBlock) {
      throw new Error('Empty response from Anthropic');
    }

    const parsed = this.parseJSONResponse(textBlock.text);
    const usage: TokenUsage = {
      promptTokens: response.usage?.input_tokens || 0,
      completionTokens: response.usage?.output_tokens || 0,
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      estimatedCost: this.calculateCost(
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0
      ),
    };

    this.requestCount++;
    return { summary: parsed, usage };
  }

  /**
   * Parse JSON response from AI
   */
  private parseJSONResponse(content: string): ArticleSummary {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize the response
      return {
        title: this.validateString(parsed.title, 'Untitled'),
        summary: this.validateString(parsed.summary, ''),
        whyItMatters: this.validateString(
          parsed.why_it_matters || parsed.whyItMatters,
          ''
        ),
      };
    } catch (error) {
      logger.error('Failed to parse AI response:', content);
      throw new Error(`Invalid JSON response: ${(error as Error).message}`);
    }
  }

  /**
   * Validate string field
   */
  private validateString(value: unknown, defaultValue: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return defaultValue;
  }

  /**
   * Calculate cost based on token usage
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    return (
      inputTokens * this.modelConfig.costPerInputToken +
      outputTokens * this.modelConfig.costPerOutputToken
    );
  }

  /**
   * Check rate limits and wait if necessary
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastResetTime;

    // Reset counter every minute
    if (elapsed >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
      return;
    }

    // Check if we're at the limit
    if (this.requestCount >= this.modelConfig.rateLimit.requestsPerMinute) {
      const waitTime = 60000 - elapsed + 100; // Wait until next minute + buffer
      logger.info(`Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    const errorMessage = String(error);
    return this.retryConfig.retryableErrors.some(
      (e) => errorMessage.includes(e)
    );
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.retryConfig.initialDelayMs * 
      Math.pow(this.retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current model config
   */
  getModelConfig(): ModelConfig {
    return { ...this.modelConfig };
  }

  /**
   * Check if client is available
   */
  isAvailable(): boolean {
    return !!(this.openai || this.anthropic);
  }
}

export const aiClient = new AIClient();
export default AIClient;

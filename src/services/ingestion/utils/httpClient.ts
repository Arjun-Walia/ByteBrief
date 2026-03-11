import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { logger } from '../../../utils/logger';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay?: number;
}

interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  retry?: Partial<RetryConfig>;
  rateLimit?: RateLimitConfig;
  headers?: Record<string, string>;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

/**
 * HTTP client with rate limiting and retry logic
 */
export class HttpClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;
  private rateLimit: RateLimitConfig | null;
  private requestTimestamps: number[] = [];
  private dailyRequestCount = 0;
  private dailyResetTime: number;
  private name: string;

  constructor(name: string, options: HttpClientOptions = {}) {
    this.name = name;
    this.retryConfig = { ...DEFAULT_RETRY, ...options.retry };
    this.rateLimit = options.rateLimit || null;
    this.dailyResetTime = this.getNextDayStart();

    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'User-Agent': 'ByteBrief/1.0 News Aggregator',
        ...options.headers,
      },
    });
  }

  private getNextDayStart(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  private async checkRateLimit(): Promise<void> {
    if (!this.rateLimit) return;

    const now = Date.now();

    // Reset daily counter if needed
    if (now >= this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = this.getNextDayStart();
    }

    // Check daily limit
    if (this.rateLimit.requestsPerDay && this.dailyRequestCount >= this.rateLimit.requestsPerDay) {
      const waitTime = this.dailyResetTime - now;
      logger.warn(`[${this.name}] Daily rate limit reached, need to wait ${Math.ceil(waitTime / 3600000)}h`);
      throw new Error(`Daily rate limit exceeded for ${this.name}`);
    }

    // Clean old timestamps (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // Check per-minute limit
    if (this.requestTimestamps.length >= this.rateLimit.requestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestTimestamp);
      
      if (waitTime > 0) {
        logger.debug(`[${this.name}] Rate limit reached, waiting ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }

    this.requestTimestamps.push(now);
    this.dailyRequestCount++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoff(attempt: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }

  private isRetryableError(error: AxiosError): boolean {
    if (!error.response) return true; // Network errors
    
    const status = error.response.status;
    // Retry on 429 (rate limit), 500-599 (server errors), and specific 4xx
    return status === 429 || status >= 500 || status === 408;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        await this.checkRateLimit();

        const response = await this.client.get<T>(url, config);
        return response.data;
      } catch (error) {
        lastError = error as Error;
        
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          
          // Handle rate limit response specifically
          if (axiosError.response?.status === 429) {
            const retryAfter = axiosError.response.headers['retry-after'];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.calculateBackoff(attempt);
            logger.warn(`[${this.name}] Rate limited (429), waiting ${waitTime}ms`);
            await this.sleep(waitTime);
            continue;
          }

          if (!this.isRetryableError(axiosError)) {
            throw error;
          }
        }

        if (attempt < this.retryConfig.maxRetries) {
          const backoff = this.calculateBackoff(attempt);
          logger.warn(`[${this.name}] Request failed, retry ${attempt + 1}/${this.retryConfig.maxRetries} in ${backoff}ms`);
          await this.sleep(backoff);
        }
      }
    }

    logger.error(`[${this.name}] Request failed after ${this.retryConfig.maxRetries} retries`);
    throw lastError;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    await this.checkRateLimit();
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }
}

export default HttpClient;

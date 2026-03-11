import { HttpClient } from '../utils/httpClient';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { RawArticle } from '../types';

interface NewsAPIArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

/**
 * NewsAPI.org client
 * Rate limits: Free tier = 100 requests/day, Developer = 500/day
 */
export class NewsAPIClient {
  private client: HttpClient;
  private apiKey: string;

  constructor() {
    this.apiKey = env.NEWSAPI_KEY || '';
    this.client = new HttpClient('NewsAPI', {
      baseURL: 'https://newsapi.org/v2',
      rateLimit: {
        requestsPerMinute: 10,
        requestsPerDay: 100, // Free tier limit
      },
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetchTechNews(pageSize = 100): Promise<RawArticle[]> {
    if (!this.isConfigured()) {
      logger.warn('NewsAPI key not configured, skipping');
      return [];
    }

    try {
      // Fetch tech news from multiple tech-related sources
      const techKeywords = 'technology OR tech OR AI OR artificial intelligence OR software OR programming OR startup OR cybersecurity';
      
      const response = await this.client.get<NewsAPIResponse>('/everything', {
        params: {
          apiKey: this.apiKey,
          q: techKeywords,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: Math.min(pageSize, 100),
        },
      });

      if (response.status !== 'ok') {
        logger.error('NewsAPI returned non-ok status:', response);
        return [];
      }

      logger.info(`NewsAPI fetched ${response.articles.length} articles`);

      return response.articles
        .filter(article => article.title && article.url)
        .map(article => this.normalizeArticle(article));
    } catch (error) {
      logger.error('NewsAPI fetch failed:', error);
      return [];
    }
  }

  async fetchTopHeadlines(): Promise<RawArticle[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get<NewsAPIResponse>('/top-headlines', {
        params: {
          apiKey: this.apiKey,
          category: 'technology',
          language: 'en',
          pageSize: 50,
        },
      });

      if (response.status !== 'ok') return [];

      logger.info(`NewsAPI headlines: ${response.articles.length} articles`);

      return response.articles
        .filter(article => article.title && article.url)
        .map(article => this.normalizeArticle(article));
    } catch (error) {
      logger.error('NewsAPI headlines failed:', error);
      return [];
    }
  }

  private normalizeArticle(article: NewsAPIArticle): RawArticle {
    return {
      title: article.title.trim(),
      url: article.url,
      content: article.content || article.description || '',
      summary: article.description || '',
      sourceName: article.source.name || 'NewsAPI',
      sourceId: 'newsapi',
      author: article.author || undefined,
      imageUrl: article.urlToImage || undefined,
      publishedAt: new Date(article.publishedAt),
      categories: ['technology'],
      raw: article,
    };
  }
}

export const newsAPIClient = new NewsAPIClient();
export default newsAPIClient;

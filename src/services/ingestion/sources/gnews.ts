import { HttpClient } from '../utils/httpClient';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { RawArticle } from '../types';

interface GNewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: {
    name: string;
    url: string;
  };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

/**
 * GNews API client
 * Rate limits: Free tier = 100 requests/day
 */
export class GNewsClient {
  private client: HttpClient;
  private apiKey: string;

  constructor() {
    this.apiKey = env.GNEWS_API_KEY || '';
    this.client = new HttpClient('GNews', {
      baseURL: 'https://gnews.io/api/v4',
      rateLimit: {
        requestsPerMinute: 5,
        requestsPerDay: 100,
      },
    });
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetchTechNews(): Promise<RawArticle[]> {
    if (!this.isConfigured()) {
      logger.warn('GNews API key not configured, skipping');
      return [];
    }

    try {
      // Search for tech news
      const response = await this.client.get<GNewsResponse>('/search', {
        params: {
          apikey: this.apiKey,
          q: 'technology OR software OR AI OR programming OR startup',
          lang: 'en',
          max: 100,
          sortby: 'publishedAt',
        },
      });

      logger.info(`GNews fetched ${response.articles?.length || 0} articles`);

      return (response.articles || [])
        .filter(article => article.title && article.url)
        .map(article => this.normalizeArticle(article));
    } catch (error) {
      logger.error('GNews fetch failed:', error);
      return [];
    }
  }

  async fetchTopTechHeadlines(): Promise<RawArticle[]> {
    if (!this.isConfigured()) return [];

    try {
      const response = await this.client.get<GNewsResponse>('/top-headlines', {
        params: {
          apikey: this.apiKey,
          topic: 'technology',
          lang: 'en',
          max: 50,
        },
      });

      logger.info(`GNews headlines: ${response.articles?.length || 0} articles`);

      return (response.articles || [])
        .filter(article => article.title && article.url)
        .map(article => this.normalizeArticle(article));
    } catch (error) {
      logger.error('GNews headlines failed:', error);
      return [];
    }
  }

  private normalizeArticle(article: GNewsArticle): RawArticle {
    return {
      title: article.title.trim(),
      url: article.url,
      content: article.content || article.description || '',
      summary: article.description || '',
      sourceName: article.source.name || 'GNews',
      sourceId: 'gnews',
      author: undefined,
      imageUrl: article.image || undefined,
      publishedAt: new Date(article.publishedAt),
      categories: ['technology'],
      raw: article,
    };
  }
}

export const gNewsClient = new GNewsClient();
export default gNewsClient;

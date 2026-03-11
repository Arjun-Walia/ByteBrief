import { HttpClient } from '../utils/httpClient';
import { logger } from '../../../utils/logger';
import { RawArticle } from '../types';

interface HNItem {
  id: number;
  type: string;
  by?: string;
  time: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
}

/**
 * Hacker News API client
 * No rate limits documented, but be respectful
 */
export class HackerNewsClient {
  private client: HttpClient;

  constructor() {
    this.client = new HttpClient('HackerNews', {
      baseURL: 'https://hacker-news.firebaseio.com/v0',
      rateLimit: {
        requestsPerMinute: 30, // Self-imposed limit
      },
    });
  }

  async fetchTopStories(limit = 50): Promise<RawArticle[]> {
    try {
      // Get top story IDs
      const storyIds = await this.client.get<number[]>('/topstories.json');
      const topIds = storyIds.slice(0, Math.min(limit, 100));

      logger.info(`HackerNews: fetching ${topIds.length} top stories`);

      // Fetch stories in batches to avoid overwhelming the API
      const articles: RawArticle[] = [];
      const batchSize = 10;

      for (let i = 0; i < topIds.length; i += batchSize) {
        const batch = topIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => this.fetchItem(id))
        );

        articles.push(
          ...batchResults
            .filter((item): item is HNItem => !!item && item.type === 'story' && !!item.url)
            .map(item => this.normalizeArticle(item))
        );
      }

      logger.info(`HackerNews fetched ${articles.length} articles`);
      return articles;
    } catch (error) {
      logger.error('HackerNews fetch failed:', error);
      return [];
    }
  }

  async fetchNewStories(limit = 50): Promise<RawArticle[]> {
    try {
      const storyIds = await this.client.get<number[]>('/newstories.json');
      const newIds = storyIds.slice(0, Math.min(limit, 100));

      logger.info(`HackerNews: fetching ${newIds.length} new stories`);

      const articles: RawArticle[] = [];
      const batchSize = 10;

      for (let i = 0; i < newIds.length; i += batchSize) {
        const batch = newIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => this.fetchItem(id))
        );

        articles.push(
          ...batchResults
            .filter((item): item is HNItem => !!item && item.type === 'story' && !!item.url)
            .map(item => this.normalizeArticle(item))
        );
      }

      logger.info(`HackerNews new stories: ${articles.length} articles`);
      return articles;
    } catch (error) {
      logger.error('HackerNews new stories failed:', error);
      return [];
    }
  }

  async fetchBestStories(limit = 30): Promise<RawArticle[]> {
    try {
      const storyIds = await this.client.get<number[]>('/beststories.json');
      const bestIds = storyIds.slice(0, Math.min(limit, 50));

      const articles: RawArticle[] = [];
      const batchSize = 10;

      for (let i = 0; i < bestIds.length; i += batchSize) {
        const batch = bestIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => this.fetchItem(id))
        );

        articles.push(
          ...batchResults
            .filter((item): item is HNItem => !!item && item.type === 'story' && !!item.url)
            .map(item => this.normalizeArticle(item))
        );
      }

      logger.info(`HackerNews best stories: ${articles.length} articles`);
      return articles;
    } catch (error) {
      logger.error('HackerNews best stories failed:', error);
      return [];
    }
  }

  private async fetchItem(id: number): Promise<HNItem | null> {
    try {
      return await this.client.get<HNItem>(`/item/${id}.json`);
    } catch {
      logger.warn(`Failed to fetch HN item ${id}`);
      return null;
    }
  }

  private normalizeArticle(item: HNItem): RawArticle {
    const publishedAt = new Date(item.time * 1000);

    return {
      title: item.title || 'Untitled',
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      content: item.text || '',
      summary: item.text ? item.text.substring(0, 300) : '',
      sourceName: 'Hacker News',
      sourceId: 'hackernews',
      author: item.by,
      imageUrl: undefined, // HN doesn't provide images
      publishedAt,
      categories: ['technology', 'hackernews'],
      metadata: {
        hnId: item.id,
        score: item.score,
        comments: item.descendants,
      },
      raw: item,
    };
  }
}

export const hackerNewsClient = new HackerNewsClient();
export default hackerNewsClient;

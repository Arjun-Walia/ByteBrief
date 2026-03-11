import { parseFeed, FeedItem } from './feedParser';
import { NEWS_SOURCES, NewsSource, getActiveSourcesByCategory } from './sources';
import { Article, Category } from '../../models';
import { generateFingerprint } from '../../utils/fingerprint';
import { logger } from '../../utils/logger';

export interface IngestionResult {
  source: string;
  total: number;
  new: number;
  duplicates: number;
  errors: number;
}

export class IngestionService {
  async ingestFromSource(source: NewsSource): Promise<IngestionResult> {
    const result: IngestionResult = {
      source: source.name,
      total: 0,
      new: 0,
      duplicates: 0,
      errors: 0,
    };

    try {
      const feed = await parseFeed(source.feedUrl);
      if (!feed) {
        logger.warn(`No feed data from ${source.name}`);
        return result;
      }

      result.total = feed.items.length;

      // Get or create category
      let category = await Category.findOne({ slug: source.category });
      if (!category) {
        category = await Category.create({
          name: source.category.charAt(0).toUpperCase() + source.category.slice(1),
          slug: source.category,
        });
      }

      for (const item of feed.items) {
        try {
          const fingerprint = generateFingerprint(item.title, item.link);
          
          // Check for existing article
          const exists = await Article.exists({ fingerprint });
          if (exists) {
            result.duplicates++;
            continue;
          }

          // Create new article
          await Article.create({
            title: item.title,
            summary: item.contentSnippet || item.content?.substring(0, 500) || '',
            content: item.content || '',
            sourceUrl: item.link,
            sourceName: source.name,
            imageUrl: item.imageUrl,
            category: category._id,
            categorySlug: source.category,
            tags: item.categories || [],
            author: item.creator,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            fingerprint,
            readTime: this.estimateReadTime(item.content || ''),
          });

          result.new++;
        } catch (error) {
          result.errors++;
          logger.error(`Error processing item from ${source.name}:`, error);
        }
      }

      // Update category article count
      const count = await Article.countDocuments({ categorySlug: source.category });
      await Category.updateOne({ _id: category._id }, { articleCount: count });

      logger.info(`Ingested from ${source.name}: ${result.new} new, ${result.duplicates} duplicates`);
    } catch (error) {
      logger.error(`Ingestion failed for ${source.name}:`, error);
    }

    return result;
  }

  async ingestAll(): Promise<IngestionResult[]> {
    const sources = getActiveSourcesByCategory();
    const results: IngestionResult[] = [];

    for (const source of sources) {
      const result = await this.ingestFromSource(source);
      results.push(result);
      
      // Small delay between sources to be polite
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  async ingestByCategory(category: string): Promise<IngestionResult[]> {
    const sources = getActiveSourcesByCategory(category);
    const results: IngestionResult[] = [];

    for (const source of sources) {
      const result = await this.ingestFromSource(source);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  private estimateReadTime(content: string): number {
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }
}

export const ingestionService = new IngestionService();

export default ingestionService;

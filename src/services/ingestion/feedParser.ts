import Parser from 'rss-parser';
import { logger } from '../../utils/logger';

export interface FeedItem {
  title: string;
  link: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  creator?: string;
  categories?: string[];
  imageUrl?: string;
}

export interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
      ['enclosure', 'enclosure'],
    ],
  },
});

export const parseFeed = async (url: string): Promise<ParsedFeed | null> => {
  try {
    const feed = await parser.parseURL(url);
    
    const items: FeedItem[] = feed.items.map((item) => {
      // Try to extract image from various possible fields
      let imageUrl: string | undefined;
      const itemAny = item as unknown as Record<string, unknown>;
      
      if (itemAny.mediaContent) {
        const media = itemAny.mediaContent as { $?: { url?: string } };
        imageUrl = media.$?.url;
      } else if (itemAny.mediaThumbnail) {
        const thumbnail = itemAny.mediaThumbnail as { $?: { url?: string } };
        imageUrl = thumbnail.$?.url;
      } else if (item.enclosure?.url) {
        imageUrl = item.enclosure.url;
      }
      
      return {
        title: item.title || '',
        link: item.link || '',
        content: item.content || (itemAny['content:encoded'] as string) || '',
        contentSnippet: item.contentSnippet || '',
        pubDate: item.pubDate || item.isoDate,
        creator: item.creator || (itemAny.author as string),
        categories: item.categories,
        imageUrl,
      };
    });
    
    return {
      title: feed.title || 'Unknown Feed',
      items,
    };
  } catch (error) {
    logger.error(`Failed to parse feed ${url}:`, error);
    return null;
  }
};

export default { parseFeed };

import * as cheerio from 'cheerio';
import { RawArticle, ProcessedArticle } from '../types';
import { deduplicationService } from './deduplication';

/**
 * Clean and normalize article content
 */
export class ContentNormalizer {
  private readonly MIN_CONTENT_LENGTH = 50;
  private readonly MAX_SUMMARY_LENGTH = 500;

  /**
   * Process a raw article into a normalized format
   */
  normalize(raw: RawArticle): ProcessedArticle {
    const cleanTitle = this.cleanText(raw.title);
    const cleanContent = this.cleanHtml(raw.content);
    const cleanSummary = this.createSummary(raw.summary || cleanContent);
    const tags = this.extractTags(raw);
    const categorySlug = this.determineCategorySlug(raw.categories, tags);
    const readTime = this.calculateReadTime(cleanContent);
    const fingerprint = deduplicationService.generateFingerprint(cleanTitle, cleanContent);

    return {
      title: cleanTitle,
      summary: cleanSummary,
      content: cleanContent,
      sourceUrl: raw.url,
      sourceName: raw.sourceName,
      sourceId: raw.sourceId,
      imageUrl: this.normalizeImageUrl(raw.imageUrl),
      categorySlug,
      tags,
      author: raw.author?.trim(),
      publishedAt: this.normalizeDate(raw.publishedAt),
      fingerprint,
      readTime,
    };
  }

  /**
   * Clean plain text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .substring(0, 300);
  }

  /**
   * Clean HTML content, extracting plain text
   */
  private cleanHtml(html: string): string {
    if (!html) return '';

    try {
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $('script, style, nav, header, footer, aside, iframe, noscript').remove();
      $('[class*="ad"], [class*="sponsor"], [class*="promo"]').remove();
      $('[id*="ad"], [id*="sponsor"], [id*="promo"]').remove();

      // Get text content
      let text = $.text();

      // Clean up whitespace
      text = text
        .replace(/\s+/g, ' ')
        .replace(/[\r\n]+/g, '\n')
        .trim();

      // Remove common boilerplate patterns
      text = this.removeBoilerplate(text);

      return text;
    } catch {
      // Fallback: simple regex-based cleaning
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  /**
   * Remove common boilerplate text
   */
  private removeBoilerplate(text: string): string {
    const boilerplatePatterns = [
      /subscribe to our newsletter/gi,
      /sign up for our newsletter/gi,
      /follow us on (twitter|facebook|instagram|linkedin)/gi,
      /share this article/gi,
      /read more:/gi,
      /related articles?:/gi,
      /advertisement/gi,
      /sponsored content/gi,
      /click here to/gi,
      /cookie(s)? policy/gi,
      /privacy policy/gi,
      /terms of (service|use)/gi,
    ];

    let cleaned = text;
    for (const pattern of boilerplatePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * Create a summary from content
   */
  private createSummary(content: string): string {
    if (!content) return '';

    // Clean and truncate
    let summary = content
      .replace(/\s+/g, ' ')
      .trim();

    if (summary.length <= this.MAX_SUMMARY_LENGTH) {
      return summary;
    }

    // Try to break at sentence boundary
    const truncated = summary.substring(0, this.MAX_SUMMARY_LENGTH);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclaim = truncated.lastIndexOf('!');

    const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);
    
    if (breakPoint > this.MAX_SUMMARY_LENGTH * 0.6) {
      return truncated.substring(0, breakPoint + 1).trim();
    }

    // Break at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    return `${truncated.substring(0, lastSpace)}...`;
  }

  /**
   * Extract and normalize tags from article
   */
  private extractTags(raw: RawArticle): string[] {
    const tags = new Set<string>();

    // Add from categories
    for (const cat of raw.categories) {
      tags.add(cat.toLowerCase());
    }

    // Extract from title
    const titleTags = this.extractKeywordsFromText(raw.title);
    for (const tag of titleTags) {
      tags.add(tag);
    }

    // Add source-specific tag
    tags.add(raw.sourceId);

    // Limit to 10 tags
    return [...tags].slice(0, 10);
  }

  /**
   * Extract keywords from text
   */
  private extractKeywordsFromText(text: string): string[] {
    const techKeywords = [
      'ai', 'ml', 'machine learning', 'artificial intelligence', 'gpt', 'llm',
      'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'devops',
      'javascript', 'typescript', 'python', 'rust', 'golang', 'java',
      'react', 'vue', 'angular', 'nodejs', 'deno', 'bun',
      'blockchain', 'crypto', 'web3', 'nft', 'defi',
      'cybersecurity', 'security', 'privacy', 'encryption',
      'startup', 'funding', 'ipo', 'acquisition', 'merger',
      'apple', 'google', 'microsoft', 'amazon', 'meta', 'nvidia', 'tesla',
      'openai', 'anthropic', 'mistral', 'gemini', 'chatgpt', 'claude',
      'mobile', 'ios', 'android', 'app', 'api', 'sdk',
      'data', 'database', 'analytics', 'big data',
      'quantum', 'robotics', 'automation', 'iot', 'edge computing',
    ];

    const lowerText = text.toLowerCase();
    return techKeywords.filter(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
  }

  /**
   * Determine category slug based on content
   */
  private determineCategorySlug(categories: string[], tags: string[]): string {
    const categoryMapping: Record<string, string[]> = {
      'ai': ['ai', 'ml', 'machine learning', 'artificial intelligence', 'gpt', 'llm', 'openai', 'anthropic', 'chatgpt', 'claude', 'gemini'],
      'programming': ['javascript', 'typescript', 'python', 'rust', 'golang', 'java', 'programming', 'coding', 'developer'],
      'cloud': ['cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'devops', 'infrastructure'],
      'security': ['cybersecurity', 'security', 'privacy', 'encryption', 'hacking', 'vulnerability'],
      'startups': ['startup', 'funding', 'ipo', 'acquisition', 'venture', 'entrepreneur'],
      'mobile': ['mobile', 'ios', 'android', 'app', 'smartphone'],
      'blockchain': ['blockchain', 'crypto', 'web3', 'nft', 'defi', 'bitcoin', 'ethereum'],
      'hardware': ['hardware', 'chip', 'processor', 'gpu', 'nvidia', 'amd', 'intel', 'quantum'],
      'opensource': ['github', 'opensource', 'open source', 'linux'],
    };

    const allTerms = [...categories, ...tags].map(t => t.toLowerCase());

    for (const [slug, keywords] of Object.entries(categoryMapping)) {
      for (const term of allTerms) {
        if (keywords.some(k => term.includes(k))) {
          return slug;
        }
      }
    }

    return 'technology'; // Default category
  }

  /**
   * Calculate read time in minutes
   */
  private calculateReadTime(content: string): number {
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return Math.max(1, Math.min(minutes, 30)); // 1-30 minutes
  }

  /**
   * Normalize image URL
   */
  private normalizeImageUrl(url?: string): string | undefined {
    if (!url) return undefined;

    try {
      // Basic URL validation
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return undefined;
      }

      // Filter out known placeholder images
      const placeholders = [
        'placeholder',
        'default',
        'no-image',
        'empty',
        '1x1',
        'spacer',
      ];

      const lowerUrl = url.toLowerCase();
      if (placeholders.some(p => lowerUrl.includes(p))) {
        return undefined;
      }

      return url;
    } catch {
      return undefined;
    }
  }

  /**
   * Normalize and validate date
   */
  private normalizeDate(date: Date): Date {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Validate date is reasonable
    if (date > now) {
      return now; // Future dates become now
    }

    if (date < oneYearAgo) {
      return now; // Very old dates become now
    }

    return date;
  }
}

export const contentNormalizer = new ContentNormalizer();
export default contentNormalizer;

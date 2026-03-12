/**
 * Push Notification Service Unit Tests
 */

import {
  detectBreakingNews,
  buildArticleNotification,
  buildDigestNotification,
  generateDeepLink,
  generateDigestLink,
} from '../../src/services/notifications/notificationService';
import { IArticle } from '../../src/models/Article';

// Mock dependencies
jest.mock('../../src/models', () => ({
  Article: {
    find: jest.fn(),
    findById: jest.fn(),
  },
  User: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
    findById: jest.fn(),
    updateMany: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
  Notification: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
  })),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/repositories', () => ({
  userRepository: {
    removeDeviceToken: jest.fn(),
    addDeviceToken: jest.fn(),
  },
}));

describe('Push Notification Service', () => {
  describe('generateDeepLink', () => {
    it('should generate correct deep link for article', () => {
      const link = generateDeepLink('article123');
      expect(link).toBe('bytebrief://article/article123');
    });
  });

  describe('generateDigestLink', () => {
    it('should generate correct digest deep link', () => {
      const link = generateDigestLink();
      expect(link).toBe('bytebrief://digest');
    });
  });

  describe('detectBreakingNews', () => {
    const createMockArticle = (overrides: Partial<IArticle> = {}): IArticle => ({
      _id: 'test-id',
      title: 'Test Article',
      summary: 'Test summary',
      content: 'Test content',
      sourceUrl: 'https://example.com/article',
      sourceName: 'Test Source',
      categorySlug: 'tech',
      tags: [],
      publishedAt: new Date(),
      score: 50,
      readTime: 5,
      fingerprint: 'test-fingerprint',
      isFeatured: false,
      viewCount: 0,
      bookmarkCount: 0,
      ...overrides,
    } as IArticle);

    it('should detect breaking news based on keywords', () => {
      const article = createMockArticle({
        title: 'OpenAI Launches GPT-5 with Breakthrough Capabilities',
        score: 80,
      });

      const result = detectBreakingNews(article);
      
      expect(result.isBreaking).toBe(true);
      expect(result.reasons.some(r => r.includes('Keywords'))).toBe(true);
    });

    it('should not flag low-score articles as breaking', () => {
      const article = createMockArticle({
        title: 'Minor Update Released',
        score: 30,
      });

      const result = detectBreakingNews(article);
      
      expect(result.isBreaking).toBe(false);
    });

    it('should boost score for recent articles', () => {
      const recentArticle = createMockArticle({
        title: 'Breaking Security Vulnerability',
        publishedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
        score: 75,
      });

      const result = detectBreakingNews(recentArticle);
      
      expect(result.reasons.some(r => r.includes('recent'))).toBe(true);
    });

    it('should boost score for authoritative sources', () => {
      const article = createMockArticle({
        title: 'Major Announcement',
        sourceName: 'OpenAI Blog',
        score: 75,
      });

      const result = detectBreakingNews(article);
      
      expect(result.reasons.some(r => r.includes('Authoritative'))).toBe(true);
    });

    it('should boost for high engagement', () => {
      const article = createMockArticle({
        title: 'Popular Tech News',
        score: 70,
        viewCount: 5000,
        bookmarkCount: 100,
      });

      const result = detectBreakingNews(article);
      
      expect(result.reasons.some(r => r.includes('views'))).toBe(true);
    });
  });

  describe('buildArticleNotification', () => {
    const mockArticle = {
      _id: 'article123',
      title: 'Test Article Title That Is Quite Long',
      summary: 'This is a test summary for the article.',
      content: 'Full article content here.',
      sourceUrl: 'https://example.com/article',
      sourceName: 'Test Source',
      imageUrl: 'https://example.com/image.jpg',
      categorySlug: 'ai',
      tags: ['ai', 'tech'],
      publishedAt: new Date(),
      score: 85,
      readTime: 5,
      fingerprint: 'fp123',
      isFeatured: false,
      viewCount: 100,
      bookmarkCount: 10,
    } as unknown as IArticle;

    it('should build notification with correct structure', () => {
      const payload = buildArticleNotification(mockArticle, 'breaking_news');

      expect(payload.title).toBe(mockArticle.title);
      expect(payload.body).toBe(mockArticle.summary);
      expect(payload.imageUrl).toBe(mockArticle.imageUrl);
      expect(payload.data.type).toBe('breaking_news');
      expect(payload.data.articleId).toBe('article123');
      expect(payload.data.deepLink).toContain('bytebrief://article/article123');
      expect(payload.priority).toBe('high');
    });

    it('should use AI summary when available', () => {
      const articleWithAI = {
        ...mockArticle,
        aiSummary: {
          title: 'AI Improved Title',
          summary: 'AI generated summary that is better.',
          whyItMatters: 'Important because...',
          generatedAt: new Date(),
          tokensUsed: 100,
        },
      } as IArticle;

      const payload = buildArticleNotification(articleWithAI, 'breaking_news');

      expect(payload.title).toBe('AI Improved Title');
      expect(payload.body).toBe('AI generated summary that is better.');
    });

    it('should truncate long body text', () => {
      const longSummary = 'A'.repeat(200);
      const articleWithLongSummary = {
        ...mockArticle,
        summary: longSummary,
      } as IArticle;

      const payload = buildArticleNotification(articleWithLongSummary, 'breaking_news');

      expect(payload.body.length).toBeLessThanOrEqual(150);
      expect(payload.body).toContain('...');
    });

    it('should set normal priority for topic alerts', () => {
      const payload = buildArticleNotification(mockArticle, 'topic_alert');
      expect(payload.priority).toBe('normal');
    });
  });

  describe('buildDigestNotification', () => {
    const mockArticles = [
      {
        _id: 'article1',
        title: 'First Article',
        summary: 'Summary 1',
        categorySlug: 'ai',
        imageUrl: 'https://example.com/img1.jpg',
      } as unknown as IArticle,
      {
        _id: 'article2',
        title: 'Second Article',
        summary: 'Summary 2',
        categorySlug: 'security',
      } as unknown as IArticle,
      {
        _id: 'article3',
        title: 'Third Article',
        summary: 'Summary 3',
        categorySlug: 'ai',
      } as unknown as IArticle,
    ];

    it('should build digest notification with article count', () => {
      const payload = buildDigestNotification(mockArticles);

      expect(payload.title).toContain('Daily Tech Digest');
      expect(payload.body).toContain('3 top stories');
      expect(payload.data.type).toBe('daily_digest');
      expect(payload.data.articleIds).toBe('article1,article2,article3');
      expect(payload.priority).toBe('normal');
    });

    it('should include first article image', () => {
      const payload = buildDigestNotification(mockArticles);
      expect(payload.imageUrl).toBe('https://example.com/img1.jpg');
    });

    it('should use custom title when provided', () => {
      const payload = buildDigestNotification(mockArticles, 'Custom Digest Title');
      expect(payload.title).toBe('Custom Digest Title');
    });

    it('should include unique categories', () => {
      const payload = buildDigestNotification(mockArticles);
      expect(payload.data.categories).toContain('ai');
      expect(payload.data.categories).toContain('security');
    });
  });
});

describe('Notification Types', () => {
  it('should have correct deep link format', () => {
    expect(generateDeepLink('123')).toMatch(/^bytebrief:\/\/article\/\w+$/);
  });

  it('should have correct digest link format', () => {
    expect(generateDigestLink()).toBe('bytebrief://digest');
  });
});

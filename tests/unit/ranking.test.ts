/**
 * Ranking Algorithm Unit Tests
 * 
 * Tests for the multi-factor scoring system.
 */

import { RankingAlgorithm, DEFAULT_CONFIG } from '../../src/services/ranking/algorithm';

describe('RankingAlgorithm', () => {
  let algorithm: RankingAlgorithm;

  beforeEach(() => {
    algorithm = new RankingAlgorithm();
  });

  describe('configuration', () => {
    it('should use default weights that sum to 1.0', () => {
      const weights = DEFAULT_CONFIG.weights;
      const sum = 
        weights.sourceWeight +
        weights.keywordWeight +
        weights.recencyWeight +
        weights.engagementWeight +
        weights.authorityWeight;
      
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should throw if custom weights do not sum to 1.0', () => {
      expect(() => {
        new RankingAlgorithm({
          weights: {
            sourceWeight: 0.5,
            keywordWeight: 0.5,
            recencyWeight: 0.5, // Sum = 1.5
            engagementWeight: 0,
            authorityWeight: 0,
          },
        });
      }).toThrow();
    });
  });

  describe('collectSignals', () => {
    it('should extract keywords from title', () => {
      const signals = algorithm.collectSignals({
        title: 'OpenAI announces breakthrough in artificial intelligence',
        sourceName: 'TechCrunch',
        categorySlug: 'ai',
        publishedAt: new Date(),
      });
      
      expect(signals.matchedKeywords).toContain('artificial intelligence');
      expect(signals.matchedKeywords).toContain('openai');
    });

    it('should calculate age in hours', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      
      const signals = algorithm.collectSignals({
        title: 'Test article',
        sourceName: 'Test',
        categorySlug: 'tech',
        publishedAt: twoHoursAgo,
      });
      
      expect(signals.ageHours).toBeCloseTo(2, 0);
    });

    it('should look up source authority', () => {
      const signals = algorithm.collectSignals({
        title: 'Test',
        sourceName: 'TechCrunch',
        categorySlug: 'tech',
        publishedAt: new Date(),
      });
      
      expect(signals.sourceAuthority).toBe(85);
    });

    it('should apply category multiplier', () => {
      const aiSignals = algorithm.collectSignals({
        title: 'Test',
        sourceName: 'Test',
        categorySlug: 'ai',
        publishedAt: new Date(),
      });

      const techSignals = algorithm.collectSignals({
        title: 'Test',
        sourceName: 'Test',
        categorySlug: 'tech',
        publishedAt: new Date(),
      });
      
      expect(aiSignals.categoryMultiplier).toBeGreaterThan(techSignals.categoryMultiplier);
    });
  });

  describe('normalizeSignals', () => {
    it('should normalize source count logarithmically', () => {
      const signals1 = algorithm.normalizeSignals({
        sourceCount: 1,
        hnScore: 0,
        ageHours: 1,
        viewCount: 0,
        bookmarkCount: 0,
        matchedKeywords: [],
        sourceAuthority: 50,
        categoryMultiplier: 1,
      });

      const signals3 = algorithm.normalizeSignals({
        sourceCount: 3,
        hnScore: 0,
        ageHours: 1,
        viewCount: 0,
        bookmarkCount: 0,
        matchedKeywords: [],
        sourceAuthority: 50,
        categoryMultiplier: 1,
      });
      
      expect(signals1.sourceScore).toBe(0.2);
      expect(signals3.sourceScore).toBeGreaterThan(signals1.sourceScore);
    });

    it('should decay recency score over time', () => {
      const fresh = algorithm.normalizeSignals({
        sourceCount: 1,
        hnScore: 0,
        ageHours: 0,
        viewCount: 0,
        bookmarkCount: 0,
        matchedKeywords: [],
        sourceAuthority: 50,
        categoryMultiplier: 1,
      });

      const old = algorithm.normalizeSignals({
        sourceCount: 1,
        hnScore: 0,
        ageHours: 24,
        viewCount: 0,
        bookmarkCount: 0,
        matchedKeywords: [],
        sourceAuthority: 50,
        categoryMultiplier: 1,
      });
      
      expect(fresh.recencyScore).toBeGreaterThan(old.recencyScore);
      // After 12 hours (half-life), should be ~0.5
      const halfLife = algorithm.normalizeSignals({
        sourceCount: 1,
        hnScore: 0,
        ageHours: 12,
        viewCount: 0,
        bookmarkCount: 0,
        matchedKeywords: [],
        sourceAuthority: 50,
        categoryMultiplier: 1,
      });
      expect(halfLife.recencyScore).toBeCloseTo(0.5, 1);
    });

    it('should cap engagement to prevent viral dominance', () => {
      const viral = algorithm.normalizeSignals({
        sourceCount: 1,
        hnScore: 10000,
        ageHours: 1,
        viewCount: 100000,
        bookmarkCount: 5000,
        matchedKeywords: [],
        sourceAuthority: 50,
        categoryMultiplier: 1,
      });
      
      expect(viral.engagementScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('rankArticle', () => {
    it('should produce higher scores for AI articles', () => {
      const aiArticle = algorithm.rankArticle({
        _id: '1',
        title: 'OpenAI announces GPT-5 with breakthrough AI capabilities',
        sourceName: 'TechCrunch',
        categorySlug: 'ai',
        publishedAt: new Date(),
        viewCount: 100,
      });

      const genericArticle = algorithm.rankArticle({
        _id: '2',
        title: 'New smartphone released', 
        sourceName: 'TechCrunch',
        categorySlug: 'mobile',
        publishedAt: new Date(),
        viewCount: 100,
      });
      
      expect(aiArticle.finalScore).toBeGreaterThan(genericArticle.finalScore);
    });

    it('should produce higher scores for recent articles', () => {
      const fresh = algorithm.rankArticle({
        _id: '1',
        title: 'Breaking news in tech',
        sourceName: 'TechCrunch',
        categorySlug: 'tech',
        publishedAt: new Date(),
      });

      const twoDay = algorithm.rankArticle({
        _id: '2',
        title: 'Breaking news in tech',
        sourceName: 'TechCrunch',
        categorySlug: 'tech',
        publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
      
      expect(fresh.finalScore).toBeGreaterThan(twoDay.finalScore);
    });

    it('should boost scores for authoritative sources', () => {
      const authoritative = algorithm.rankArticle({
        _id: '1',
        title: 'Tech announcement',
        sourceName: 'MIT Technology Review',
        categorySlug: 'tech',
        publishedAt: new Date(),
      });

      const lessTrusted = algorithm.rankArticle({
        _id: '2',
        title: 'Tech announcement',
        sourceName: 'Unknown Blog',
        categorySlug: 'tech',
        publishedAt: new Date(),
      });
      
      expect(authoritative.finalScore).toBeGreaterThan(lessTrusted.finalScore);
    });

    it('should return component scores breakdown', () => {
      const result = algorithm.rankArticle({
        _id: '1',
        title: 'Test article',
        sourceName: 'TechCrunch',
        categorySlug: 'ai',
        publishedAt: new Date(),
      });
      
      expect(result.componentScores).toHaveProperty('source');
      expect(result.componentScores).toHaveProperty('keyword');
      expect(result.componentScores).toHaveProperty('recency');
      expect(result.componentScores).toHaveProperty('engagement');
      expect(result.componentScores).toHaveProperty('authority');
    });
  });

  describe('selectTopArticles', () => {
    it('should return top N articles sorted by score', () => {
      const articles = [
        { _id: '1', title: 'Low priority article', sourceName: 'Blog', categorySlug: 'other', publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        { _id: '2', title: 'OpenAI GPT-5 AI breakthrough', sourceName: 'TechCrunch', categorySlug: 'ai', publishedAt: new Date() },
        { _id: '3', title: 'Security vulnerability discovered', sourceName: 'Krebs on Security', categorySlug: 'security', publishedAt: new Date() },
      ];
      
      const top2 = algorithm.selectTopArticles(articles, 2);
      
      expect(top2).toHaveLength(2);
      expect(top2[0].rank).toBe(1);
      expect(top2[1].rank).toBe(2);
      expect(top2[0].finalScore).toBeGreaterThanOrEqual(top2[1].finalScore);
    });

    it('should handle empty input', () => {
      const result = algorithm.selectTopArticles([], 10);
      expect(result).toHaveLength(0);
    });

    it('should handle fewer articles than requested', () => {
      const articles = [
        { _id: '1', title: 'Article', sourceName: 'Test', categorySlug: 'tech', publishedAt: new Date() },
      ];
      
      const result = algorithm.selectTopArticles(articles, 10);
      expect(result).toHaveLength(1);
    });
  });
});

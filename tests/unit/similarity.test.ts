/**
 * Similarity Engine Unit Tests
 * 
 * Tests for TF-IDF vectorization and cosine similarity.
 */

import { SimilarityEngine } from '../../src/services/clustering/similarity';

describe('SimilarityEngine', () => {
  let engine: SimilarityEngine;

  beforeEach(() => {
    engine = new SimilarityEngine();
  });

  describe('preprocess', () => {
    it('should tokenize text and remove stop words', () => {
      const tokens = engine.preprocess('The quick brown fox jumps over the lazy dog');
      
      expect(tokens).not.toContain('the');
      // 'over' is not in the stop words list
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('should remove URLs', () => {
      const tokens = engine.preprocess('Check out https://example.com for more info');
      
      expect(tokens.join(' ')).not.toContain('https');
      expect(tokens.join(' ')).not.toContain('example');
    });

    it('should filter short tokens', () => {
      const tokens = engine.preprocess('AI is a big deal in tech');
      
      expect(tokens).not.toContain('is');
      expect(tokens).not.toContain('a');
      expect(tokens).toContain('big');
      expect(tokens).toContain('deal');
      expect(tokens).toContain('tech');
    });

    it('should handle empty input', () => {
      expect(engine.preprocess('')).toEqual([]);
      expect(engine.preprocess('   ')).toEqual([]);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = engine.buildTitleVector('OpenAI releases GPT-5');
      const similarity = engine.cosineSimilarity(vec, vec);
      
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for completely different vectors', () => {
      const vec1 = engine.buildTitleVector('OpenAI releases new model');
      const vec2 = engine.buildTitleVector('Weather forecast sunny tomorrow');
      const similarity = engine.cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBeLessThan(0.3);
    });

    it('should return high similarity for related titles', () => {
      const vec1 = engine.buildTitleVector('OpenAI announces GPT-5 release');
      const vec2 = engine.buildTitleVector('GPT-5 released by OpenAI');
      const similarity = engine.cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle empty vectors', () => {
      const emptyVec = { terms: new Map(), magnitude: 0 };
      const vec = engine.buildTitleVector('Some text');
      
      expect(engine.cosineSimilarity(emptyVec, vec)).toBe(0);
      expect(engine.cosineSimilarity(vec, emptyVec)).toBe(0);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1.0 for identical texts', () => {
      const similarity = engine.jaccardSimilarity(
        'OpenAI GPT model',
        'OpenAI GPT model'
      );
      
      expect(similarity).toBe(1.0);
    });

    it('should return 0 for completely different texts', () => {
      const similarity = engine.jaccardSimilarity(
        'artificial intelligence machine learning',
        'weather forecast sunny'
      );
      
      expect(similarity).toBe(0);
    });

    it('should return partial similarity for overlapping texts', () => {
      const similarity = engine.jaccardSimilarity(
        'OpenAI launches new AI model',
        'OpenAI announces AI breakthrough'
      );
      
      expect(similarity).toBeGreaterThanOrEqual(0.2);
      expect(similarity).toBeLessThan(0.8);
    });
  });

  describe('calculateCombinedSimilarity', () => {
    it('should weight title higher than content', () => {
      // Same title, different content
      const similarityHighTitle = engine.calculateCombinedSimilarity(
        'Breaking: OpenAI GPT-5',
        'The company announced today...',
        'Breaking: OpenAI GPT-5',
        'In a press release yesterday...'
      );
      
      // Different title, same content
      const similarityHighContent = engine.calculateCombinedSimilarity(
        'OpenAI News',
        'The company announced today the release of GPT-5',
        'Tech Update',
        'The company announced today the release of GPT-5'
      );
      
      expect(similarityHighTitle).toBeGreaterThan(similarityHighContent);
    });

    it('should return high similarity when titles match', () => {
      const similarity = engine.calculateCombinedSimilarity(
        'Google announces Gemini 2.0',
        'Mountain View tech giant reveals...',
        'Google announces Gemini 2.0 AI',
        'In a blog post today...'
      );
      
      expect(similarity).toBeGreaterThan(0.8);
    });
  });

  describe('ngramSimilarity', () => {
    it('should detect similar strings with typos', () => {
      const similarity = engine.ngramSimilarity(
        'artificial intelligence',
        'artifical inteligence', // typos
        3
      );
      
      expect(similarity).toBeGreaterThan(0.6);
    });

    it('should return 1.0 for identical strings', () => {
      const similarity = engine.ngramSimilarity('hello world', 'hello world', 3);
      
      expect(similarity).toBe(1.0);
    });
  });

  describe('corpus management', () => {
    it('should track document count', () => {
      engine.initializeCorpus([
        'OpenAI GPT model release',
        'Google AI breakthrough',
        'Microsoft Azure update',
      ]);
      
      const stats = engine.getStats();
      expect(stats.documentCount).toBe(3);
      expect(stats.vocabularySize).toBeGreaterThan(0);
    });

    it('should update vocabulary on addToCorpus', () => {
      const statsBefore = engine.getStats();
      engine.addToCorpus('New article about blockchain technology');
      const statsAfter = engine.getStats();
      
      expect(statsAfter.documentCount).toBe(statsBefore.documentCount + 1);
    });
  });
});

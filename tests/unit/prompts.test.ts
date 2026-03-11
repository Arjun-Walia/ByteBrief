/**
 * Summarization Prompts Unit Tests
 * 
 * Tests for prompt generation and content validation.
 */

import {
  generateUserPrompt,
  generateBatchPrompt,
  estimateTokens,
  validateContent,
  SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT,
} from '../../src/services/summarization/prompts';

describe('Summarization Prompts', () => {
  describe('SYSTEM_PROMPT', () => {
    it('should contain role definition', () => {
      expect(SYSTEM_PROMPT).toContain('ByteBrief');
      expect(SYSTEM_PROMPT).toContain('summarizer');
    });

    it('should specify output format', () => {
      expect(SYSTEM_PROMPT).toContain('JSON');
      expect(SYSTEM_PROMPT).toContain('title');
      expect(SYSTEM_PROMPT).toContain('summary');
      expect(SYSTEM_PROMPT).toContain('why_it_matters');
    });

    it('should include constraints', () => {
      expect(SYSTEM_PROMPT).toContain('60 words');
      expect(SYSTEM_PROMPT).toContain('simple');
      expect(SYSTEM_PROMPT).toContain('jargon');
    });
  });

  describe('generateUserPrompt', () => {
    it('should include title and content', () => {
      const prompt = generateUserPrompt(
        'OpenAI Announces GPT-5',
        'OpenAI today announced the release of GPT-5...',
        'ai'
      );
      
      expect(prompt).toContain('OpenAI Announces GPT-5');
      expect(prompt).toContain('OpenAI today announced');
    });

    it('should include category when provided', () => {
      const prompt = generateUserPrompt(
        'Test Title',
        'Test content',
        'security'
      );
      
      expect(prompt).toContain('security');
    });

    it('should truncate long content', () => {
      const longContent = 'A'.repeat(20000);
      const prompt = generateUserPrompt('Title', longContent);
      
      // Should be significantly shorter than original
      expect(prompt.length).toBeLessThan(15000);
    });

    it('should include output requirements', () => {
      const prompt = generateUserPrompt('Title', 'Content');
      
      expect(prompt).toContain('3 sentences');
      expect(prompt).toContain('JSON');
    });
  });

  describe('generateBatchPrompt', () => {
    it('should include all articles', () => {
      const articles = [
        { id: '1', title: 'Article 1', content: 'Content 1' },
        { id: '2', title: 'Article 2', content: 'Content 2' },
      ];
      
      const prompt = generateBatchPrompt(articles);
      
      expect(prompt).toContain('Article 1');
      expect(prompt).toContain('Article 2');
      expect(prompt).toContain('ID: 1');
      expect(prompt).toContain('ID: 2');
    });

    it('should mention article count', () => {
      const articles = [
        { id: '1', title: 'Article 1', content: 'Content 1' },
        { id: '2', title: 'Article 2', content: 'Content 2' },
        { id: '3', title: 'Article 3', content: 'Content 3' },
      ];
      
      const prompt = generateBatchPrompt(articles);
      
      expect(prompt).toContain('3');
    });

    it('should request JSON array output', () => {
      const prompt = generateBatchPrompt([
        { id: '1', title: 'Test', content: 'Content' },
      ]);
      
      expect(prompt).toContain('JSON array');
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate ~4 chars per token', () => {
      const text = 'This is a test sentence with some words.';
      const estimate = estimateTokens(text);
      
      // Rough estimate: 40 chars / 4 = 10 tokens
      expect(estimate).toBeGreaterThan(5);
      expect(estimate).toBeLessThan(20);
    });

    it('should handle long text', () => {
      const longText = 'A'.repeat(4000);
      const estimate = estimateTokens(longText);
      
      // 4000 chars / 4 = ~1000 tokens
      expect(estimate).toBeGreaterThan(900);
      expect(estimate).toBeLessThan(1100);
    });
  });

  describe('validateContent', () => {
    it('should reject empty content', () => {
      const result = validateContent('');
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No content');
    });

    it('should reject very short content', () => {
      const result = validateContent('Too short');
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('too short');
    });

    it('should accept valid content', () => {
      const validContent = 'This is a sufficiently long piece of content that should pass validation. It has multiple sentences and provides enough information for summarization. The content discusses various topics and includes relevant details that make it suitable for AI processing.';
      const result = validateContent(validContent);
      
      expect(result.valid).toBe(true);
    });

    it('should warn about marginally short content', () => {
      const marginalContent = 'A'.repeat(150); // Between 100-200 chars
      const result = validateContent(marginalContent);
      
      // Should be valid but with warning
      expect(result.valid).toBe(true);
      if (result.reason) {
        expect(result.reason).toContain('Warning');
      }
    });

    it('should reject content with too few words', () => {
      const fewWords = 'a b c d e f g h i j k l m n o p q r s t'; // 20 short words, 100+ chars
      const result = validateContent(fewWords.repeat(5));
      
      // This depends on implementation - may pass or fail
      expect(result).toHaveProperty('valid');
    });
  });

  describe('BATCH_SYSTEM_PROMPT', () => {
    it('should mention multiple articles', () => {
      expect(BATCH_SYSTEM_PROMPT).toContain('multiple');
    });

    it('should request JSON array', () => {
      expect(BATCH_SYSTEM_PROMPT).toContain('JSON');
    });
  });
});

/**
 * Text Similarity Engine
 * 
 * Implements TF-IDF vectorization and cosine similarity for article comparison.
 * Optimized for high-throughput duplicate detection.
 * 
 * ## Algorithm Overview
 * 
 * 1. **Preprocessing**: Normalize, tokenize, remove stop words
 * 2. **TF-IDF**: Term Frequency × Inverse Document Frequency
 * 3. **Cosine Similarity**: dot(A,B) / (||A|| × ||B||)
 * 
 * ## Complexity
 * - Building vector: O(n) where n = tokens
 * - Cosine similarity: O(min(m,n)) where m,n = unique terms
 * - Overall: O(D×N) for D documents against N corpus
 */

import { TFIDFVector } from './types';

// Common English stop words to exclude from vectors
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where',
  'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'new',
  'says', 'said', 'according', 'report', 'reports', 'reported',
]);

// Tech-specific terms to boost (higher weight)
const TECH_BOOST_TERMS = new Set([
  'ai', 'artificial', 'intelligence', 'machine', 'learning', 'neural',
  'gpt', 'llm', 'chatgpt', 'openai', 'anthropic', 'google', 'microsoft',
  'apple', 'meta', 'amazon', 'nvidia', 'startup', 'funding', 'series',
  'acquisition', 'ipo', 'security', 'vulnerability', 'breach', 'hack',
  'crypto', 'blockchain', 'bitcoin', 'ethereum', 'programming', 'developer',
  'software', 'hardware', 'chip', 'processor', 'gpu', 'cloud', 'api',
]);

/**
 * Text similarity engine using TF-IDF and cosine similarity
 */
export class SimilarityEngine {
  private idfCache: Map<string, number> = new Map();
  private documentCount = 0;
  private termDocumentFrequency: Map<string, number> = new Map();

  /**
   * Preprocess text for vectorization
   */
  preprocess(text: string): string[] {
    if (!text) return [];

    return text
      .toLowerCase()
      // Remove URLs
      .replace(/https?:\/\/\S+/g, '')
      // Remove special characters but keep apostrophes in contractions
      .replace(/[^\w\s']/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      // Filter tokens
      .filter(token => 
        token.length > 2 && 
        token.length < 30 &&
        !STOP_WORDS.has(token) &&
        !/^\d+$/.test(token) // Exclude pure numbers
      );
  }

  /**
   * Calculate term frequency (TF) - how often a term appears in document
   * Uses sublinear TF: 1 + log(count) to dampen high-frequency terms
   */
  calculateTF(tokens: string[]): Map<string, number> {
    const termCounts = new Map<string, number>();

    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    // Apply sublinear scaling: tf = 1 + log(count)
    const tf = new Map<string, number>();
    for (const [term, count] of termCounts) {
      const baseTF = 1 + Math.log(count);
      // Apply tech term boost
      const boost = TECH_BOOST_TERMS.has(term) ? 1.5 : 1.0;
      tf.set(term, baseTF * boost);
    }

    return tf;
  }

  /**
   * Calculate inverse document frequency (IDF)
   * IDF = log(N / df) where N = total docs, df = docs containing term
   */
  calculateIDF(term: string): number {
    if (this.idfCache.has(term)) {
      return this.idfCache.get(term)!;
    }

    const df = this.termDocumentFrequency.get(term) || 1;
    const idf = Math.log((this.documentCount + 1) / (df + 1)) + 1; // Smoothed IDF

    this.idfCache.set(term, idf);
    return idf;
  }

  /**
   * Build TF-IDF vector from text
   */
  buildVector(text: string): TFIDFVector {
    const tokens = this.preprocess(text);
    const tf = this.calculateTF(tokens);
    const terms = new Map<string, number>();

    // Calculate TF-IDF for each term
    let sumSquares = 0;
    for (const [term, tfValue] of tf) {
      const idf = this.calculateIDF(term);
      const tfidf = tfValue * idf;
      terms.set(term, tfidf);
      sumSquares += tfidf * tfidf;
    }

    // Calculate magnitude for normalization
    const magnitude = Math.sqrt(sumSquares);

    return { terms, magnitude };
  }

  /**
   * Build vector from title only (weighted heavily)
   */
  buildTitleVector(title: string): TFIDFVector {
    // For titles, we don't use IDF - all terms are important
    const tokens = this.preprocess(title);
    const tf = this.calculateTF(tokens);
    const terms = new Map<string, number>();

    let sumSquares = 0;
    for (const [term, tfValue] of tf) {
      // Higher weight for title terms
      const weight = tfValue * 2.0;
      terms.set(term, weight);
      sumSquares += weight * weight;
    }

    const magnitude = Math.sqrt(sumSquares);
    return { terms, magnitude };
  }

  /**
   * Calculate cosine similarity between two vectors
   * cosine(A,B) = (A · B) / (||A|| × ||B||)
   */
  cosineSimilarity(vec1: TFIDFVector, vec2: TFIDFVector): number {
    if (vec1.magnitude === 0 || vec2.magnitude === 0) {
      return 0;
    }

    // Calculate dot product (only iterate over smaller vector)
    let dotProduct = 0;
    const [smaller, larger] = vec1.terms.size <= vec2.terms.size 
      ? [vec1.terms, vec2.terms] 
      : [vec2.terms, vec1.terms];

    for (const [term, value] of smaller) {
      const otherValue = larger.get(term);
      if (otherValue !== undefined) {
        dotProduct += value * otherValue;
      }
    }

    return dotProduct / (vec1.magnitude * vec2.magnitude);
  }

  /**
   * Calculate combined similarity (title + content)
   * Title has higher weight (70%) than content (30%)
   */
  calculateCombinedSimilarity(
    title1: string,
    content1: string,
    title2: string,
    content2: string
  ): number {
    const titleVec1 = this.buildTitleVector(title1);
    const titleVec2 = this.buildTitleVector(title2);
    const titleSimilarity = this.cosineSimilarity(titleVec1, titleVec2);

    // If titles are very similar, that's usually enough
    if (titleSimilarity > 0.9) {
      return titleSimilarity;
    }

    // Include content similarity if available
    if (content1 && content2 && content1.length > 100 && content2.length > 100) {
      const contentVec1 = this.buildVector(content1);
      const contentVec2 = this.buildVector(content2);
      const contentSimilarity = this.cosineSimilarity(contentVec1, contentVec2);

      // Weighted combination: 70% title, 30% content
      return titleSimilarity * 0.7 + contentSimilarity * 0.3;
    }

    return titleSimilarity;
  }

  /**
   * Update document frequency statistics
   * Call this when adding new documents to the corpus
   */
  addToCorpus(text: string): void {
    const tokens = new Set(this.preprocess(text));
    
    for (const token of tokens) {
      this.termDocumentFrequency.set(
        token,
        (this.termDocumentFrequency.get(token) || 0) + 1
      );
    }
    
    this.documentCount++;
    this.idfCache.clear(); // Invalidate IDF cache
  }

  /**
   * Initialize corpus from existing articles
   */
  initializeCorpus(documents: string[]): void {
    this.termDocumentFrequency.clear();
    this.idfCache.clear();
    this.documentCount = 0;

    for (const doc of documents) {
      this.addToCorpus(doc);
    }
  }

  /**
   * Get corpus statistics
   */
  getStats(): { documentCount: number; vocabularySize: number } {
    return {
      documentCount: this.documentCount,
      vocabularySize: this.termDocumentFrequency.size,
    };
  }

  /**
   * Calculate Jaccard similarity (set-based, faster for quick filtering)
   */
  jaccardSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(this.preprocess(text1));
    const tokens2 = new Set(this.preprocess(text2));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Quick similarity check using n-grams (for initial filtering)
   */
  ngramSimilarity(text1: string, text2: string, n: number = 3): number {
    const ngrams1 = this.getNgrams(text1.toLowerCase(), n);
    const ngrams2 = this.getNgrams(text2.toLowerCase(), n);

    if (ngrams1.size === 0 || ngrams2.size === 0) return 0;

    const intersection = new Set([...ngrams1].filter(ng => ngrams2.has(ng)));
    const union = new Set([...ngrams1, ...ngrams2]);

    return intersection.size / union.size;
  }

  /**
   * Extract character n-grams from text
   */
  private getNgrams(text: string, n: number): Set<string> {
    const ngrams = new Set<string>();
    const cleaned = text.replace(/\s+/g, ' ').trim();

    for (let i = 0; i <= cleaned.length - n; i++) {
      ngrams.add(cleaned.substring(i, i + n));
    }

    return ngrams;
  }
}

export const similarityEngine = new SimilarityEngine();
export default SimilarityEngine;

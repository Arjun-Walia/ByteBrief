import { RawArticle, TechFilterResult } from '../types';

/**
 * Keywords and patterns used to identify tech content
 */
const TECH_KEYWORDS = {
  highWeight: [
    // AI/ML
    'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
    'gpt', 'llm', 'chatgpt', 'claude', 'gemini', 'openai', 'anthropic',
    'natural language processing', 'nlp', 'computer vision',
    
    // Programming
    'software', 'programming', 'developer', 'coding', 'algorithm',
    'api', 'sdk', 'framework', 'library', 'open source',
    
    // Cloud/Infrastructure
    'cloud computing', 'aws', 'azure', 'google cloud', 'kubernetes', 'docker',
    'devops', 'microservices', 'serverless',
    
    // Security
    'cybersecurity', 'data breach', 'ransomware', 'encryption', 'vulnerability',
    'zero-day', 'malware', 'phishing',
    
    // Hardware
    'semiconductor', 'processor', 'gpu', 'chip', 'quantum computing',
    
    // Startup/Business Tech
    'tech startup', 'silicon valley', 'venture capital', 'series a', 'series b',
    'unicorn', 'ipo tech',
  ],
  mediumWeight: [
    // Languages
    'javascript', 'typescript', 'python', 'rust', 'golang', 'java', 'swift',
    'kotlin', 'c++', 'ruby', 'php',
    
    // Frameworks
    'react', 'vue', 'angular', 'nodejs', 'django', 'flask', 'spring',
    'nextjs', 'nuxt', 'svelte',
    
    // Databases
    'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
    
    // Companies (tech-specific)
    'google', 'microsoft', 'apple', 'amazon', 'meta', 'facebook', 'nvidia',
    'intel', 'amd', 'tesla', 'spacex', 'twitter', 'linkedin',
    
    // Crypto/Blockchain
    'blockchain', 'cryptocurrency', 'bitcoin', 'ethereum', 'web3', 'nft', 'defi',
    
    // Mobile
    'ios', 'android', 'mobile app', 'smartphone',
    
    // General Tech
    'technology', 'tech news', 'digital', 'internet', 'online', 'app',
    'platform', 'saas', 'paas', 'iaas',
  ],
  lowWeight: [
    // General terms that might indicate tech
    'innovation', 'disrupt', 'automation', 'robotics', 'drone',
    'virtual reality', 'vr', 'augmented reality', 'ar', 'metaverse',
    'data', 'analytics', 'big data', 'iot', 'smart device',
    'streaming', 'gaming', 'esports', 'video game',
    'electric vehicle', 'ev', 'self-driving', 'autonomous',
  ],
};

/**
 * Non-tech terms that reduce score
 */
const NON_TECH_INDICATORS = [
  'sports', 'football', 'basketball', 'baseball', 'soccer',
  'celebrity', 'entertainment', 'gossip', 'kardashian',
  'recipe', 'cooking', 'restaurant', 'food review',
  'fashion', 'beauty', 'makeup', 'skincare',
  'real estate', 'mortgage', 'housing market',
  'travel', 'vacation', 'tourism', 'hotel',
  'weather forecast', 'horoscope', 'astrology',
  'politics', 'election', 'senate', 'congress', 'president',
];

/**
 * Filter articles to only tech-related content
 */
export class TechFilter {
  private readonly TECH_THRESHOLD = 0.3;

  /**
   * Check if an article is tech-related
   */
  isTechContent(article: RawArticle): TechFilterResult {
    const textToAnalyze = `${article.title} ${article.summary} ${article.content}`.toLowerCase();
    
    let score = 0;
    const matchedKeywords: string[] = [];

    // Check high weight keywords (+3 each)
    for (const keyword of TECH_KEYWORDS.highWeight) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        score += 3;
        matchedKeywords.push(keyword);
      }
    }

    // Check medium weight keywords (+2 each)
    for (const keyword of TECH_KEYWORDS.mediumWeight) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        score += 2;
        matchedKeywords.push(keyword);
      }
    }

    // Check low weight keywords (+1 each)
    for (const keyword of TECH_KEYWORDS.lowWeight) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        score += 1;
        matchedKeywords.push(keyword);
      }
    }

    // Check non-tech indicators (-2 each)
    for (const indicator of NON_TECH_INDICATORS) {
      if (textToAnalyze.includes(indicator.toLowerCase())) {
        score -= 2;
      }
    }

    // Boost for tech-specific sources
    const techSources = ['hackernews', 'github-trending', 'techcrunch', 'theverge', 'arstechnica', 'wired'];
    if (techSources.some(s => article.sourceId.includes(s) || article.sourceName.toLowerCase().includes(s))) {
      score += 5;
    }

    // Normalize score (0-1 range)
    const maxPossibleScore = 30; // Reasonable max
    const normalizedScore = Math.max(0, Math.min(1, score / maxPossibleScore));

    return {
      isTech: normalizedScore >= this.TECH_THRESHOLD,
      score: normalizedScore,
      matchedKeywords: [...new Set(matchedKeywords)].slice(0, 10),
    };
  }

  /**
   * Filter an array of articles to only tech content
   */
  filterTechArticles(articles: RawArticle[]): RawArticle[] {
    return articles.filter(article => {
      const result = this.isTechContent(article);
      return result.isTech;
    });
  }

  /**
   * Get tech score for an article (for ranking purposes)
   */
  getTechScore(article: RawArticle): number {
    return this.isTechContent(article).score;
  }
}

export const techFilter = new TechFilter();
export default techFilter;

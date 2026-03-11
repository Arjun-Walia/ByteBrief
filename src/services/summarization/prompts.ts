/**
 * Prompt Templates for Article Summarization
 * 
 * Design Philosophy:
 * - Clear, structured output requirements
 * - Emphasis on simplicity and accessibility
 * - Token-efficient prompts
 * - JSON output for reliable parsing
 */

/**
 * System prompt for summarization
 * Sets the AI's role, constraints, and output format
 */
export const SYSTEM_PROMPT = `You are ByteBrief, an expert tech news summarizer. Your job is to make complex tech news accessible to everyone.

ROLE: Transform technical articles into clear, simple summaries that anyone can understand.

RULES:
1. Use simple, everyday language
2. Avoid jargon - if you must use a technical term, briefly explain it
3. Focus on WHAT happened and WHY it matters
4. Be accurate - don't add information not in the source
5. Keep it concise - every word should earn its place

OUTPUT FORMAT (JSON):
{
  "title": "Improved headline (under 80 chars)",
  "summary": "3 sentences max, under 60 words total",
  "why_it_matters": "1-2 sentences explaining real-world impact"
}

TONE: Informative, accessible, neutral. Like explaining to a smart friend who doesn't work in tech.`;

/**
 * Generate user prompt for a specific article
 */
export function generateUserPrompt(
  title: string,
  content: string,
  category?: string
): string {
  // Truncate content for token efficiency (approx 4 chars per token)
  // Target ~2000 tokens for content = ~8000 chars
  const truncatedContent = truncateContent(content, 8000);

  return `Summarize this ${category ? category + ' ' : ''}tech article:

ORIGINAL TITLE: ${title}

ARTICLE CONTENT:
${truncatedContent}

Remember:
- Summary: 3 sentences, max 60 words, simple language
- Title: Clear, engaging, under 80 characters
- Why It Matters: Real-world impact in 1-2 sentences

Respond with JSON only.`;
}

/**
 * Generate batch prompt for multiple articles
 * More token-efficient than individual calls
 */
export function generateBatchPrompt(
  articles: Array<{
    id: string;
    title: string;
    content: string;
    category?: string;
  }>
): string {
  const articleTexts = articles.map((article, index) => {
    const truncatedContent = truncateContent(article.content, 3000);
    return `--- ARTICLE ${index + 1} (ID: ${article.id}) ---
TITLE: ${article.title}
CATEGORY: ${article.category || 'tech'}
CONTENT: ${truncatedContent}`;
  });

  return `Summarize these ${articles.length} tech articles. For each, provide:

${articleTexts.join('\n\n')}

Respond with a JSON array:
[
  {
    "id": "article_id",
    "title": "improved headline",
    "summary": "3 sentences, max 60 words",
    "why_it_matters": "real-world impact"
  },
  ...
]

Keep summaries simple, clear, and jargon-free.`;
}

/**
 * Batch system prompt
 */
export const BATCH_SYSTEM_PROMPT = `You are ByteBrief, a tech news summarizer processing multiple articles.

For EACH article, provide:
1. title: Improved headline (under 80 chars)
2. summary: 3 sentences max, under 60 words, simple language
3. why_it_matters: Real-world impact (1-2 sentences)

RULES:
- Use everyday language, not tech jargon
- Be accurate to the source
- Focus on impact and significance
- Return valid JSON array

Keep it simple - explain tech like you would to a smart friend.`;

/**
 * Smart content truncation
 * Preserves meaningful content while respecting token limits
 */
function truncateContent(content: string, maxChars: number): string {
  if (!content) return '';
  
  // Clean the content first
  let cleaned = content
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/\[.*?\]/g, '')        // Remove markdown links
    .replace(/https?:\/\/\S+/g, '') // Remove URLs
    .replace(/[^\w\s.,!?;:'"()-]/g, '') // Remove special chars
    .trim();

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  // Try to cut at sentence boundary
  const truncated = cleaned.substring(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );

  if (lastSentenceEnd > maxChars * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace > 0 ? lastSpace : maxChars) + '...';
}

/**
 * Estimate token count for a string
 * Rough approximation: 1 token ≈ 4 characters for English
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Check if content is summarizable
 * Returns reasons if not
 */
export function validateContent(content: string): { 
  valid: boolean; 
  reason?: string 
} {
  if (!content || typeof content !== 'string') {
    return { valid: false, reason: 'No content provided' };
  }

  const trimmed = content.trim();
  
  if (trimmed.length < 100) {
    return { valid: false, reason: 'Content too short (min 100 chars)' };
  }

  if (trimmed.length < 200) {
    return { valid: true, reason: 'Warning: Short content may produce low-quality summary' };
  }

  // Check for meaningful content (not just links or formatting)
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 30) {
    return { valid: false, reason: 'Not enough words (min 30)' };
  }

  return { valid: true };
}

export default {
  SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT,
  generateUserPrompt,
  generateBatchPrompt,
  estimateTokens,
  validateContent,
};

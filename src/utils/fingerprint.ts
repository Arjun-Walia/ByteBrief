import crypto from 'crypto';

/**
 * Generate a fingerprint for an article to detect duplicates
 */
export const generateFingerprint = (title: string, url: string): string => {
  // Normalize the title - lowercase, remove special chars, collapse whitespace
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract domain from URL
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    domain = url;
  }

  // Create hash from normalized title + domain
  const content = `${normalizedTitle}|${domain}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
};

/**
 * Generate a content-based fingerprint for clustering similar articles
 */
export const generateContentFingerprint = (content: string): string => {
  // Extract significant words (remove common words)
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'they', 'their', 'them',
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));

  // Get word frequency
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  // Get top 20 most frequent words
  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word)
    .sort()
    .join('|');

  return crypto.createHash('sha256').update(topWords).digest('hex').substring(0, 32);
};

export default { generateFingerprint, generateContentFingerprint };

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  category: string;
  isActive: boolean;
  priority: number;
}

export const NEWS_SOURCES: NewsSource[] = [
  // AI & Machine Learning
  {
    id: 'openai-blog',
    name: 'OpenAI Blog',
    feedUrl: 'https://openai.com/blog/rss/',
    category: 'ai',
    isActive: true,
    priority: 10,
  },
  {
    id: 'mit-tech-ai',
    name: 'MIT Technology Review - AI',
    feedUrl: 'https://www.technologyreview.com/feed/',
    category: 'ai',
    isActive: true,
    priority: 9,
  },
  
  // Tech News
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    feedUrl: 'https://techcrunch.com/feed/',
    category: 'startups',
    isActive: true,
    priority: 9,
  },
  {
    id: 'verge',
    name: 'The Verge',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    category: 'tech',
    isActive: true,
    priority: 8,
  },
  {
    id: 'ars-technica',
    name: 'Ars Technica',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    category: 'tech',
    isActive: true,
    priority: 8,
  },
  
  // Developer Tools
  {
    id: 'github-blog',
    name: 'GitHub Blog',
    feedUrl: 'https://github.blog/feed/',
    category: 'devtools',
    isActive: true,
    priority: 9,
  },
  {
    id: 'dev-to',
    name: 'DEV Community',
    feedUrl: 'https://dev.to/feed',
    category: 'devtools',
    isActive: true,
    priority: 7,
  },
  
  // Security
  {
    id: 'krebs-security',
    name: 'Krebs on Security',
    feedUrl: 'https://krebsonsecurity.com/feed/',
    category: 'security',
    isActive: true,
    priority: 9,
  },
  {
    id: 'schneier',
    name: 'Schneier on Security',
    feedUrl: 'https://www.schneier.com/feed/',
    category: 'security',
    isActive: true,
    priority: 8,
  },
  
  // Hacker News (top stories)
  {
    id: 'hacker-news',
    name: 'Hacker News',
    feedUrl: 'https://hnrss.org/frontpage',
    category: 'tech',
    isActive: true,
    priority: 10,
  },
];

export const getActiveSourcesByCategory = (category?: string): NewsSource[] => {
  return NEWS_SOURCES
    .filter(source => source.isActive && (!category || source.category === category))
    .sort((a, b) => b.priority - a.priority);
};

export const getSourceById = (id: string): NewsSource | undefined => {
  return NEWS_SOURCES.find(source => source.id === id);
};

export default { NEWS_SOURCES, getActiveSourcesByCategory, getSourceById };

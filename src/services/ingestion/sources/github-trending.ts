import { HttpClient } from '../utils/httpClient';
import { logger } from '../../../utils/logger';
import { RawArticle } from '../types';
import * as cheerio from 'cheerio';

interface TrendingRepo {
  author: string;
  name: string;
  url: string;
  description: string;
  language: string | null;
  stars: number;
  forks: number;
  starsToday: number;
  builtBy: Array<{ username: string; href: string; avatar: string }>;
}

/**
 * GitHub Trending scraper
 * No official API, so we scrape the trending page
 */
export class GitHubTrendingClient {
  private client: HttpClient;

  constructor() {
    this.client = new HttpClient('GitHubTrending', {
      baseURL: 'https://github.com',
      rateLimit: {
        requestsPerMinute: 5, // Be respectful
      },
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  }

  async fetchTrendingRepos(spokenLanguage = 'en'): Promise<RawArticle[]> {
    try {
      // Fetch trending page for different time ranges
      const [daily, weekly] = await Promise.all([
        this.scrapeTrendingPage('', spokenLanguage),
        this.scrapeTrendingPage('weekly', spokenLanguage),
      ]);

      // Combine and deduplicate
      const seen = new Set<string>();
      const repos: TrendingRepo[] = [];

      for (const repo of [...daily, ...weekly]) {
        const key = `${repo.author}/${repo.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          repos.push(repo);
        }
      }

      logger.info(`GitHub Trending: ${repos.length} repositories`);

      return repos.map(repo => this.normalizeToArticle(repo));
    } catch (error) {
      logger.error('GitHub Trending fetch failed:', error);
      return [];
    }
  }

  private async scrapeTrendingPage(since: string, spokenLanguage: string): Promise<TrendingRepo[]> {
    try {
      const params = new URLSearchParams();
      if (since) params.set('since', since);
      if (spokenLanguage) params.set('spoken_language_code', spokenLanguage);

      const url = `/trending?${params.toString()}`;
      const html = await this.client.get<string>(url);

      return this.parseTrendingHtml(html);
    } catch (error) {
      logger.warn(`Failed to scrape GitHub trending page:`, error);
      return [];
    }
  }

  private parseTrendingHtml(html: string): TrendingRepo[] {
    const $ = cheerio.load(html);
    const repos: TrendingRepo[] = [];

    $('article.Box-row').each((_, element) => {
      try {
        const $el = $(element);
        
        // Extract repo name and author
        const repoLink = $el.find('h2 a').attr('href') || '';
        const [, author, name] = repoLink.split('/');
        
        if (!author || !name) return;

        // Description
        const description = $el.find('p.col-9').text().trim();

        // Language
        const language = $el.find('[itemprop="programmingLanguage"]').text().trim() || null;

        // Stars
        const starsText = $el.find('a[href$="/stargazers"]').text().trim().replace(',', '');
        const stars = parseInt(starsText) || 0;

        // Forks
        const forksText = $el.find('a[href$="/forks"]').text().trim().replace(',', '');
        const forks = parseInt(forksText) || 0;

        // Stars today
        const starsTodayText = $el.find('.float-sm-right').text().trim();
        const match = starsTodayText.match(/(\d+(?:,\d+)?)\s+stars/);
        const starsToday = match ? parseInt(match[1].replace(',', '')) : 0;

        // Built by
        const builtBy: TrendingRepo['builtBy'] = [];
        $el.find('a[data-hovercard-type="user"]').each((_, userEl) => {
          const $user = $(userEl);
          builtBy.push({
            username: $user.find('img').attr('alt')?.replace('@', '') || '',
            href: `https://github.com${$user.attr('href')}`,
            avatar: $user.find('img').attr('src') || '',
          });
        });

        repos.push({
          author,
          name,
          url: `https://github.com${repoLink}`,
          description,
          language,
          stars,
          forks,
          starsToday,
          builtBy,
        });
      } catch {
        // Skip malformed entries
      }
    });

    return repos;
  }

  private normalizeToArticle(repo: TrendingRepo): RawArticle {
    const languageTag = repo.language ? repo.language.toLowerCase().replace(/[^a-z0-9]/g, '') : 'general';

    return {
      title: `[GitHub Trending] ${repo.author}/${repo.name}: ${repo.description.substring(0, 100)}`,
      url: repo.url,
      content: repo.description,
      summary: `⭐ ${repo.stars.toLocaleString()} stars | ${repo.starsToday} today | ${repo.forks.toLocaleString()} forks${repo.language ? ` | ${repo.language}` : ''}`,
      sourceName: 'GitHub Trending',
      sourceId: 'github-trending',
      author: repo.author,
      imageUrl: repo.builtBy[0]?.avatar,
      publishedAt: new Date(), // Trending repos are "current"
      categories: ['technology', 'github', 'opensource', languageTag],
      metadata: {
        stars: repo.stars,
        starsToday: repo.starsToday,
        forks: repo.forks,
        language: repo.language,
        repoName: repo.name,
        repoAuthor: repo.author,
      },
      raw: repo,
    };
  }
}

export const githubTrendingClient = new GitHubTrendingClient();
export default githubTrendingClient;

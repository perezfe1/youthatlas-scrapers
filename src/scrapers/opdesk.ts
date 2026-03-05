import { BaseScraper } from '@/scrapers/base-scraper.js';
import type { ScraperConfig } from '@/types/scraper.js';

type CheerioAPI = Parameters<InstanceType<typeof BaseScraper>['extractListingUrls']>[0];

const CONFIG: ScraperConfig = {
  name: 'OpDesk',
  sourceSite: 'opportunitydesk.org',
  baseUrl: 'https://opportunitydesk.org',
  maxPages: 50,
  rateLimitSeconds: 3,
};

/**
 * Categories confirmed live. /opportunities/... paths redirect to old posts —
 * the real taxonomy is /category/{slug}/.
 */
const CATEGORIES = [
  'fellowships-and-scholarships',
  'awards-and-grants',
  'jobs-and-internships',
  'contests',
] as const;

/** Pages per category to seed. Conservative start — each page has ~15 listings. */
const INDEX_PAGES_PER_CATEGORY = 2;

export class OpDeskScraper extends BaseScraper {
  constructor() {
    super(CONFIG);
  }

  getStartUrls(): string[] {
    const urls: string[] = [];
    for (const cat of CATEGORIES) {
      urls.push(`${CONFIG.baseUrl}/category/${cat}/`);
      for (let i = 2; i <= INDEX_PAGES_PER_CATEGORY; i++) {
        urls.push(`${CONFIG.baseUrl}/category/${cat}/page/${i}/`);
      }
    }
    return urls;
  }

  extractListingUrls($: CheerioAPI, indexUrl: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // OpportunityDesk: article.l-post cards, title link in h2 > a
    $('article.l-post h2 a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      let cleanUrl: string;
      try {
        const parsed = new URL(href, CONFIG.baseUrl);
        if (!parsed.hostname.includes('opportunitydesk.org')) return;
        parsed.search = ''; // strip any tracking params
        cleanUrl = parsed.toString();
      } catch {
        return;
      }

      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);
      urls.push(cleanUrl);
    });

    this.log.info('Extracted listing URLs from index page', { indexUrl, count: urls.length });
    return urls;
  }

  extractPageData($: CheerioAPI, url: string): { title: string; html: string } | null {
    // h1.post-title is the OpportunityDesk theme title class
    const title = $('h1.post-title, h1').first().text().trim();
    if (!title) {
      this.log.warn('No title found on detail page', { url });
      return null;
    }

    const contentSelectors = [
      'div.entry-content',
      'div.post-content',
      'article .content',
      'article',
    ];

    let contentHtml = '';
    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        const clone = el.clone();
        clone.find([
          'script', 'style', 'iframe',
          '.social-share', '.share-buttons', '.sharedaddy',
          '.related-posts', '.post-tags', '.post-navigation',
          'nav', '.advertisement', '.ad-wrapper', 'form',
        ].join(', ')).remove();
        contentHtml = clone.html() ?? '';
        break;
      }
    }

    if (!contentHtml) {
      this.log.warn('No content found on detail page', { url });
      return null;
    }

    const textLength = contentHtml.replace(/<[^>]*>/g, '').trim().length;
    if (textLength < 100) {
      this.log.warn('Content too short, skipping', { url, textLength });
      return null;
    }

    return { title, html: contentHtml };
  }
}

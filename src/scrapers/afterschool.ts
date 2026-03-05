import { BaseScraper } from '@/scrapers/base-scraper.js';
import type { ScraperConfig } from '@/types/scraper.js';

type CheerioAPI = Parameters<InstanceType<typeof BaseScraper>['extractListingUrls']>[0];

const CONFIG: ScraperConfig = {
  name: 'AfterSchool',
  sourceSite: 'afterschoolafrica.com',
  baseUrl: 'https://www.afterschoolafrica.com',
  maxPages: 50,
  rateLimitSeconds: 3,
};

/**
 * Category slugs confirmed live.
 * CRITICAL: singular forms only — /scholarships/ (plural) 301-redirects to a PNG.
 */
const CATEGORIES = [
  'scholarship',      // singular — /scholarships/ redirects to an image
  'fellowships',
  'internship',       // singular
  'research-grants',
] as const;

/** Pages per category to seed (each page has ~12-15 listings). */
const INDEX_PAGES_PER_CATEGORY = 2;

/**
 * AfterSchoolAfrica uses numeric-ID URL slugs, not date-based paths:
 * https://www.afterschoolafrica.com/{numeric_id}/{post-slug}/
 */
const DETAIL_URL_PATTERN =
  /^https?:\/\/www\.afterschoolafrica\.com\/\d+\/[^/]+\/?$/;

export class AfterSchoolScraper extends BaseScraper {
  constructor() {
    super(CONFIG);
  }

  getStartUrls(): string[] {
    const urls: string[] = [];
    for (const cat of CATEGORIES) {
      urls.push(`${CONFIG.baseUrl}/${cat}/`);
      for (let i = 2; i <= INDEX_PAGES_PER_CATEGORY; i++) {
        urls.push(`${CONFIG.baseUrl}/${cat}/page/${i}/`);
      }
    }
    return urls;
  }

  extractListingUrls($: CheerioAPI, indexUrl: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // Match numeric-ID post URLs; regex filters out categories, tags, pagination, etc.
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // Normalise: ensure trailing slash for consistent dedup
      let cleanUrl = href.trim();
      if (!cleanUrl.endsWith('/')) cleanUrl += '/';

      if (!DETAIL_URL_PATTERN.test(cleanUrl)) return;
      if (!cleanUrl.includes('afterschoolafrica.com')) return;

      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);
      urls.push(cleanUrl);
    });

    this.log.info('Extracted listing URLs from index page', { indexUrl, count: urls.length });
    return urls;
  }

  extractPageData($: CheerioAPI, url: string): { title: string; html: string } | null {
    // AfterSchoolAfrica uses GenerateBlocks theme — h1 has class gb-headline-text
    const title = $('h1.gb-headline-text, h1').first().text().trim();
    if (!title) {
      this.log.warn('No title found on detail page', { url });
      return null;
    }

    // dynamic-entry-content is the GenerateBlocks content wrapper
    const contentSelectors = [
      'div.dynamic-entry-content',
      'div.entry-content',
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
          '.gb-button-wrapper', '.newsletter-signup',
          'nav', 'form', '.related-posts', '.post-navigation',
          '.advertisement', '.ad-wrapper',
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

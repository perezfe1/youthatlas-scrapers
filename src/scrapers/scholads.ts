import { BaseScraper } from '@/scrapers/base-scraper.js';
import type { ScraperConfig } from '@/types/scraper.js';

type CheerioAPI = Parameters<InstanceType<typeof BaseScraper>['extractListingUrls']>[0];

const CONFIG: ScraperConfig = {
  name: 'ScholAds',
  sourceSite: 'scholarshipsads.com',
  baseUrl: 'https://www.scholarshipsads.com',
  maxPages: 50,
  rateLimitSeconds: 3,
};

/**
 * ScholarshipsAds uses query-string pagination (?page=N), not WordPress /page/N/.
 * The main listing page has 42 cards per page. We seed 2 pages conservatively.
 * /category/scholarships/ returns 404 — the working entry point is /latest-scholarships.
 */
const START_PAGES = 2;

/**
 * Detail page URLs are single-segment slugs:
 *   https://www.scholarshipsads.com/some-scholarship-name
 * Non-post paths to exclude: /latest-scholarships, /scholarships-in-*, /category/*, /categories/*
 */
const NON_POST_PREFIXES = [
  '/latest-scholarships',
  '/scholarships-in-',
  '/category/',
  '/categories/',
  '/tags/',
  '/about',
  '/contact',
  '/privacy',
  '/sitemap',
];

export class ScholAdsScraper extends BaseScraper {
  constructor() {
    super(CONFIG);
  }

  getStartUrls(): string[] {
    const urls: string[] = [`${CONFIG.baseUrl}/latest-scholarships`];
    for (let i = 2; i <= START_PAGES; i++) {
      urls.push(`${CONFIG.baseUrl}/latest-scholarships?page=${i}`);
    }
    return urls;
  }

  extractListingUrls($: CheerioAPI, indexUrl: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // ScholarshipsAds: card-scholarships > h5.card-title > a
    $('div.card-scholarships h5.card-title a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      let cleanUrl: string;
      try {
        const parsed = new URL(href, CONFIG.baseUrl);
        if (!parsed.hostname.includes('scholarshipsads.com')) return;
        parsed.search = ''; // strip query params (e.g. UTM trackers)
        cleanUrl = parsed.toString();
      } catch {
        return;
      }

      // Exclude known non-post paths
      const path = new URL(cleanUrl).pathname;
      if (NON_POST_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

      // Must be a single-segment slug path (e.g. /some-scholarship-2026)
      const segments = path.split('/').filter(Boolean);
      if (segments.length !== 1) return;

      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);
      urls.push(cleanUrl);
    });

    this.log.info('Extracted listing URLs from index page', { indexUrl, count: urls.length });
    return urls;
  }

  extractPageData($: CheerioAPI, url: string): { title: string; html: string } | null {
    // ScholarshipsAds detail pages have NO <h1> — the scholarship name is an <h2>
    // inside div.entry-content.scholarship-item
    const contentEl = $('div.entry-content.scholarship-item').first();

    const title = contentEl.find('h2').first().text().trim()
      || $('h1').first().text().trim()
      || $('meta[property="og:title"]').attr('content')?.trim()
      || '';

    if (!title) {
      this.log.warn('No title found on detail page', { url });
      return null;
    }

    let contentHtml = '';
    if (contentEl.length > 0) {
      const clone = contentEl.clone();
      clone.find([
        'script', 'style', 'iframe',
        '.social-share', '.share-buttons',
        'nav', 'form', '.advertisement', '.ad-wrapper',
      ].join(', ')).remove();
      contentHtml = clone.html() ?? '';
    }

    // Fallback to broader selectors if entry-content not found
    if (!contentHtml) {
      for (const selector of ['div.scholarship-entry', 'div.scholarship-content', 'article']) {
        const el = $(selector).first();
        if (el.length > 0) {
          const clone = el.clone();
          clone.find('script, style, iframe, form, nav').remove();
          contentHtml = clone.html() ?? '';
          break;
        }
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

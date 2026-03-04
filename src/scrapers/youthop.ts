import { BaseScraper } from '@/scrapers/base-scraper.js';
import type { ScraperConfig } from '@/types/scraper.js';

type CheerioAPI = Parameters<InstanceType<typeof BaseScraper>['extractListingUrls']>[0];

const CONFIG: ScraperConfig = {
  name: 'YouthOp',
  sourceSite: 'youthop.com',
  baseUrl: 'https://www.youthop.com',
  maxPages: 50,
  rateLimitSeconds: 3,
};

/** How many index pages to scrape. Start conservative — increase after confirming stability. */
const INDEX_PAGES_TO_SCRAPE = 3;

export class YouthOpScraper extends BaseScraper {
  constructor() {
    super(CONFIG);
  }

  getStartUrls(): string[] {
    const urls: string[] = [`${CONFIG.baseUrl}/browse`];

    // Pages 2 through INDEX_PAGES_TO_SCRAPE
    for (let i = 2; i <= INDEX_PAGES_TO_SCRAPE; i++) {
      urls.push(`${CONFIG.baseUrl}/browse/page/${i}`);
    }

    return urls;
  }

  extractListingUrls($: CheerioAPI, indexUrl: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // YouthOp cards: <a> tags containing <h3> that link to detail pages
    $('a:has(h3)').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // Clean the URL: remove ?ref=browse_page query param
      let cleanUrl: string;
      try {
        const parsed = new URL(href, CONFIG.baseUrl);
        // Only accept URLs on youthop.com
        if (!parsed.hostname.includes('youthop.com')) return;
        // Remove tracking params
        parsed.searchParams.delete('ref');
        cleanUrl = parsed.toString();
      } catch {
        return; // Skip malformed URLs
      }

      // Deduplicate within this page
      if (seen.has(cleanUrl)) return;
      seen.add(cleanUrl);

      urls.push(cleanUrl);
    });

    this.log.info('Extracted listing URLs from index page', {
      indexUrl,
      count: urls.length,
    });

    return urls;
  }

  extractPageData(
    $: CheerioAPI,
    url: string,
  ): { title: string; html: string } | null {
    // 1. Extract title from <h1>
    const title = $('h1').first().text().trim();
    if (!title) {
      this.log.warn('No <h1> found on detail page', { url });
      return null;
    }

    // 2. Extract the main content body
    // YouthOp uses WordPress — the main content is typically in
    // .entry-content, .post-content, article, or the main content area.
    // We try multiple selectors in order of specificity.
    const contentSelectors = [
      '.entry-content',
      '.post-content',
      '.article-content',
      'article .content',
      'article',
    ];

    let contentHtml = '';

    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        // Clone and remove elements we don't want
        const clone = el.clone();
        clone.find('script, style, .social-share, .share-buttons, .post-tags, nav, .comments, .related-posts, .advertisement, .ad-wrapper, iframe').remove();
        contentHtml = clone.html() ?? '';
        break;
      }
    }

    // Fallback: if no content selector matched, grab everything inside <main> or the body
    // but strip navigation, header, footer, sidebar
    if (!contentHtml) {
      const fallback = $('main').first();
      if (fallback.length > 0) {
        const clone = fallback.clone();
        clone.find('script, style, nav, header, footer, aside, .sidebar, .social-share, .share-buttons, iframe').remove();
        contentHtml = clone.html() ?? '';
      }
    }

    if (!contentHtml) {
      this.log.warn('No content found on detail page', { url });
      return null;
    }

    // 3. Sanity check: skip pages with very little content (likely error pages or redirects)
    const textLength = contentHtml.replace(/<[^>]*>/g, '').trim().length;
    if (textLength < 100) {
      this.log.warn('Content too short, likely not an opportunity page', {
        url,
        textLength,
      });
      return null;
    }

    return { title, html: contentHtml };
  }
}

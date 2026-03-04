import { BaseScraper } from '@/scrapers/base-scraper.js';
import type { ScraperConfig } from '@/types/scraper.js';

type CheerioAPI = Parameters<InstanceType<typeof BaseScraper>['extractListingUrls']>[0];

const CONFIG: ScraperConfig = {
  name: 'OFY',
  sourceSite: 'opportunitiesforyouth.org',
  baseUrl: 'https://opportunitiesforyouth.org',
  maxPages: 50,
  rateLimitSeconds: 3,
};

/**
 * OFY category slugs to scrape.
 * Each gets page 1 + additional pages up to INDEX_PAGES_PER_CATEGORY.
 */
const CATEGORIES = [
  'scholarships',
  'grants',
  'internships',
  'conferences',
  'fellowship',  // singular slug — confirmed 200, /category/fellowships/ redirects to homepage
] as const;

/** How many pages per category to scrape. Start conservative. */
const INDEX_PAGES_PER_CATEGORY = 2;

export class OFYScraper extends BaseScraper {
  constructor() {
    super(CONFIG);
  }

  getStartUrls(): string[] {
    const urls: string[] = [];

    for (const category of CATEGORIES) {
      // Page 1
      urls.push(`${CONFIG.baseUrl}/category/${category}/`);

      // Pages 2+
      for (let i = 2; i <= INDEX_PAGES_PER_CATEGORY; i++) {
        urls.push(`${CONFIG.baseUrl}/category/${category}/page/${i}/`);
      }
    }

    return urls;
  }

  extractListingUrls($: CheerioAPI, indexUrl: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // OFY is WordPress — look for links to detail pages.
    // Detail page URLs match: opportunitiesforyouth.org/{year}/{month}/{day}/{slug}/
    // We find all <a> tags whose href matches this pattern.
    const detailUrlPattern = /^https?:\/\/opportunitiesforyouth\.org\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // Normalize: ensure trailing slash for consistency
      let cleanUrl = href.trim();
      if (!cleanUrl.endsWith('/')) {
        cleanUrl += '/';
      }

      // Must match the detail page URL pattern
      if (!detailUrlPattern.test(cleanUrl)) return;

      // Must be on the OFY domain
      if (!cleanUrl.includes('opportunitiesforyouth.org')) return;

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
    // 1. Extract title — try <h1> first, then first <h2> (some WP themes use h2 for post titles)
    let title = $('h1').first().text().trim();
    if (!title) {
      title = $('h2.entry-title, h2.post-title, article h2').first().text().trim();
    }
    if (!title) {
      this.log.warn('No title found on detail page', { url });
      return null;
    }

    // 2. Extract main content — .entry-content is the WordPress standard
    const contentSelectors = [
      '.entry-content',
      '.post-content',
      'article .content',
      'article',
    ];

    let contentHtml = '';

    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        const clone = el.clone();

        // Remove elements we don't want in the raw HTML
        clone.find([
          'script',
          'style',
          'iframe',                    // YouTube embeds, etc.
          '.social-share',
          '.share-buttons',
          '.sharedaddy',               // Jetpack sharing
          '.post-tags',
          '.post-navigation',
          '.comments',
          '.related-posts',
          '.widget',
          '.sidebar',
          '.newsletter-signup',
          '.subscribe-form',
          '.mc4wp-form',               // Mailchimp forms
          'form',                      // Any forms (subscribe, etc.)
          'nav',
          '.advertisement',
          '.ad-wrapper',
          '.wp-block-embed',           // Embedded content blocks
        ].join(', ')).remove();

        contentHtml = clone.html() ?? '';
        break;
      }
    }

    // Fallback: grab <main> if no content selector matched
    if (!contentHtml) {
      const fallback = $('main').first();
      if (fallback.length > 0) {
        const clone = fallback.clone();
        clone.find('script, style, nav, header, footer, aside, .sidebar, iframe, form').remove();
        contentHtml = clone.html() ?? '';
      }
    }

    if (!contentHtml) {
      this.log.warn('No content found on detail page', { url });
      return null;
    }

    // 3. Sanity check: skip pages with very little text content
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

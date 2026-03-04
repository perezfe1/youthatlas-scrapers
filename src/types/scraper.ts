import type { Result } from '@/types/opportunity.js';

/** Raw page data collected by a scraper before Claude extraction. */
export interface ScrapedPage {
  /** The URL of the detail page that was scraped */
  sourceUrl: string;
  /** Title extracted from the page (from <title> or first <h1>) */
  title: string;
  /** The raw HTML content of the page body */
  rawHtml: string;
  /** ISO timestamp of when this page was scraped */
  scrapedAt: string;
}

/** Aggregate result from a single scraper run. */
export interface ScrapeResult {
  /** Which source site this run covered */
  sourceSite: string;
  /** UUID of the scrape_runs record for this run */
  runId: string;
  /** All pages successfully scraped */
  pages: ScrapedPage[];
  /** Run statistics */
  stats: {
    /** Total listing URLs found on index pages */
    found: number;
    /** Pages successfully scraped */
    scraped: number;
    /** Pages that failed after retries */
    errors: number;
  };
}

/** Configuration that each scraper provides to the base class. */
export interface ScraperConfig {
  /** Human-readable name for logging (e.g., "YouthOp") */
  name: string;
  /** Matches source_site column in DB (e.g., "youthop.com") */
  sourceSite: string;
  /** Base URL of the site (e.g., "https://www.youthop.com") */
  baseUrl: string;
  /** Override max pages per run (defaults to constants.SCRAPING.MAX_PAGES_PER_SOURCE) */
  maxPages?: number;
  /** Override rate limit in seconds (defaults to constants.SCRAPING.RATE_LIMIT_SECONDS) */
  rateLimitSeconds?: number;
  /** Override max retries (defaults to constants.SCRAPING.MAX_RETRIES) */
  maxRetries?: number;
}

/** Row shape for the scrape_runs table. */
export interface ScrapeRunRow {
  id?: string;
  source_site: string;
  started_at?: string;
  completed_at?: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  listings_found: number;
  listings_new: number;
  listings_duplicate: number;
  error_message?: string | null;
  duration_seconds?: number | null;
}

// Re-export Result so scraper files only need one type import
export type { Result };

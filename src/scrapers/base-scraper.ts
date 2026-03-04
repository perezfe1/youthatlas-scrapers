import { CheerioCrawler, type CheerioCrawlingContext } from 'crawlee';

// CheerioAPI is a transitive type — derive it from the context rather than importing cheerio directly
type CheerioAPI = CheerioCrawlingContext['$'];

import { getSupabaseClient } from '@/lib/supabase.js';
import { createLogger, type Logger } from '@/lib/logger.js';
import { SCRAPING } from '@/config/constants.js';
import type { Result } from '@/types/opportunity.js';
import type { ScrapedPage, ScrapeResult, ScraperConfig, ScrapeRunRow } from '@/types/scraper.js';

/** Labels to distinguish index pages from detail pages in the request queue. */
const PAGE_LABELS = {
  INDEX: 'INDEX',
  DETAIL: 'DETAIL',
} as const;

export abstract class BaseScraper {
  protected readonly config: ScraperConfig;
  protected readonly log: Logger;
  private readonly pages: ScrapedPage[] = [];
  private stats = { found: 0, scraped: 0, errors: 0 };

  constructor(config: ScraperConfig) {
    this.config = config;
    this.log = createLogger(config.name);
  }

  // ─── Abstract methods — child classes MUST implement ───

  /** Return the index/listing page URLs to start crawling from. */
  abstract getStartUrls(): string[];

  /**
   * Given a loaded index page, extract the URLs of individual opportunity detail pages.
   * Return an array of absolute URLs.
   */
  abstract extractListingUrls($: CheerioAPI, indexUrl: string): string[];

  /**
   * Given a loaded detail page, extract the page title and relevant HTML content.
   * Return null to skip this page (e.g., if it's not actually an opportunity).
   */
  abstract extractPageData($: CheerioAPI, url: string): { title: string; html: string } | null;

  // ─── Public API ───

  /** Execute the full scrape cycle. Returns Result<ScrapeResult>. */
  async run(): Promise<Result<ScrapeResult>> {
    const startTime = Date.now();
    let runId: string | null = null;

    try {
      // 1. Record run start
      const runResult = await this.startRun();
      if (runResult.error) {
        return { data: null, error: runResult.error };
      }
      runId = runResult.data;
      this.log.info('Scrape run started', { runId });

      // 2. Reset state for this run
      this.pages.length = 0;
      this.stats = { found: 0, scraped: 0, errors: 0 };

      // 3. Configure and run the crawler
      const maxPages = this.config.maxPages ?? SCRAPING.MAX_PAGES_PER_SOURCE;
      const rateLimitMs = (this.config.rateLimitSeconds ?? SCRAPING.RATE_LIMIT_SECONDS) * 1000;
      const maxRetries = this.config.maxRetries ?? SCRAPING.MAX_RETRIES;

      const crawler = new CheerioCrawler({
        maxRequestsPerMinute: Math.floor(60000 / rateLimitMs),
        maxRequestRetries: maxRetries,
        requestHandlerTimeoutSecs: 30,
        maxConcurrency: 1, // Be polite — one request at a time per site
        requestHandler: async (context) => {
          await this.handleRequest(context, maxPages);
        },
        failedRequestHandler: async ({ request }, error) => {
          this.stats.errors++;
          this.log.error('Request failed after retries', {
            url: request.url,
            error: error.message,
          });
        },
      });

      // 4. Seed the crawler with index pages
      const startUrls = this.getStartUrls();
      const requests = startUrls.map((url) => ({
        url,
        label: PAGE_LABELS.INDEX,
      }));

      this.log.info('Starting crawl', { indexPages: startUrls.length, maxPages });
      await crawler.run(requests);

      // 5. Determine run status
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      const status = this.stats.errors > 0 && this.stats.scraped > 0 ? 'partial' as const
        : this.stats.errors > 0 ? 'failed' as const
        : 'success' as const;

      // 6. Update run record
      await this.completeRun(runId, status, durationSeconds);

      this.log.info('Scrape run completed', {
        status,
        found: this.stats.found,
        scraped: this.stats.scraped,
        errors: this.stats.errors,
        durationSeconds,
      });

      const result: ScrapeResult = {
        sourceSite: this.config.sourceSite,
        runId,
        pages: [...this.pages],
        stats: { ...this.stats },
      };

      return { data: result, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error('Scrape run crashed', { error: message });

      if (runId) {
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);
        await this.completeRun(runId, 'failed', durationSeconds, message);
      }

      return {
        data: null,
        error: {
          code: 'SCRAPE_RUN_FAILED',
          message: `${this.config.name} scrape failed: ${message}`,
        },
      };
    }
  }

  // ─── Private methods ───

  private async handleRequest(context: CheerioCrawlingContext, maxPages: number): Promise<void> {
    const { request, $ } = context;
    const label = request.label ?? PAGE_LABELS.INDEX;

    if (label === PAGE_LABELS.INDEX) {
      await this.handleIndexPage($, request.url, context, maxPages);
    } else if (label === PAGE_LABELS.DETAIL) {
      await this.handleDetailPage($, request.url);
    }
  }

  private async handleIndexPage(
    $: CheerioAPI,
    url: string,
    context: CheerioCrawlingContext,
    maxPages: number,
  ): Promise<void> {
    this.log.info('Processing index page', { url });

    const listingUrls = this.extractListingUrls($, url);
    this.stats.found += listingUrls.length;
    this.log.info('Found listing URLs', { count: listingUrls.length, url });

    // Cap at maxPages to avoid runaway scraping
    const cappedUrls = listingUrls.slice(0, maxPages - this.pages.length);

    // Enqueue detail pages
    const requests = cappedUrls.map((detailUrl) => ({
      url: detailUrl,
      label: PAGE_LABELS.DETAIL,
    }));

    await context.addRequests(requests);
  }

  private async handleDetailPage($: CheerioAPI, url: string): Promise<void> {
    const pageData = this.extractPageData($, url);

    if (!pageData) {
      this.log.warn('Skipped page — extractPageData returned null', { url });
      return;
    }

    const scrapedPage: ScrapedPage = {
      sourceUrl: url,
      title: pageData.title.trim(),
      rawHtml: pageData.html,
      scrapedAt: new Date().toISOString(),
    };

    this.pages.push(scrapedPage);
    this.stats.scraped++;
    this.log.debug('Scraped page', { url, title: scrapedPage.title });
  }

  private async startRun(): Promise<Result<string>> {
    try {
      const supabase = getSupabaseClient();
      const row: Partial<ScrapeRunRow> = {
        source_site: this.config.sourceSite,
        status: 'running',
        listings_found: 0,
        listings_new: 0,
        listings_duplicate: 0,
      };

      const { data, error } = await supabase
        .from('scrape_runs')
        .insert(row)
        .select('id')
        .single();

      if (error) {
        return {
          data: null,
          error: { code: 'DB_INSERT_FAILED', message: `Failed to create scrape run: ${error.message}` },
        };
      }

      return { data: data.id, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        data: null,
        error: { code: 'DB_INSERT_FAILED', message },
      };
    }
  }

  private async completeRun(
    runId: string,
    status: ScrapeRunRow['status'],
    durationSeconds: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const update: Partial<ScrapeRunRow> = {
        status,
        completed_at: new Date().toISOString(),
        listings_found: this.stats.found,
        duration_seconds: durationSeconds,
        error_message: errorMessage ?? null,
      };

      const { error } = await supabase
        .from('scrape_runs')
        .update(update)
        .eq('id', runId);

      if (error) {
        this.log.error('Failed to update scrape run', { runId, error: error.message });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error('Failed to update scrape run', { runId, error: message });
    }
  }
}

import { createLogger } from '@/lib/logger.js';
import { notifyPipelineSummary } from '@/lib/telegram.js';
import { BaseScraper } from '@/scrapers/base-scraper.js';
import { YouthOpScraper } from '@/scrapers/youthop.js';
import { OFYScraper } from '@/scrapers/ofy.js';
import { OpDeskScraper } from '@/scrapers/opdesk.js';
import { AfterSchoolScraper } from '@/scrapers/afterschool.js';
import { ScholAdsScraper } from '@/scrapers/scholads.js';
import { extractPages } from '@/processing/extractor.js';
import { deduplicateBatch, type ExtractedItem } from '@/processing/deduplication.js';
import { storeBatch, type StoreResult } from '@/processing/store.js';
import type { ScrapedPage } from '@/types/scraper.js';

const log = createLogger('pipeline');

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineOptions = {
  /** Which scrapers to run by registry key; undefined = all. */
  scrapers?: string[];
  /** Skip the store step (dry run). */
  extractOnly?: boolean;
  /** Max pages to extract per scraper (for testing). */
  limit?: number;
};

export type ScraperPipelineResult = {
  scraper: string;
  status: 'success' | 'partial' | 'failed';
  scraped: number;
  extracted: number;
  unique: number;
  stored: { inserted: number; updated: number; failed: number };
  errors: string[];
  durationMs: number;
};

export type PipelineResult = {
  results: ScraperPipelineResult[];
  totalInserted: number;
  totalUpdated: number;
  totalErrors: number;
  durationMs: number;
};

// ── Scraper registry ──────────────────────────────────────────────────────────

const SCRAPER_REGISTRY: Record<string, () => BaseScraper> = {
  youthop: () => new YouthOpScraper(),
  ofy: () => new OFYScraper(),
  opdesk: () => new OpDeskScraper(),
  afterschool: () => new AfterSchoolScraper(),
  scholads: () => new ScholAdsScraper(),
};

// ── Step helpers (each ≤ 30 lines) ───────────────────────────────────────────

async function scrapeStep(
  scraper: BaseScraper,
  limit?: number,
): Promise<{ pages: ScrapedPage[]; sourceSite: string } | null> {
  const result = await scraper.run();
  if (result.error) {
    log.error('Scrape step failed', { error: result.error.message });
    return null;
  }
  const all = result.data.pages;
  const pages = limit !== undefined ? all.slice(0, limit) : all;
  if (pages.length === 0) {
    log.warn('Scrape returned 0 pages after limit');
    return null;
  }
  return { pages, sourceSite: result.data.sourceSite };
}

async function extractStep(pages: ScrapedPage[]): Promise<ExtractedItem[] | null> {
  const result = await extractPages(pages);
  if (result.error) {
    log.error('Extract step failed', { error: result.error.message });
    return null;
  }
  const succeeded = result.data.results
    .filter((r): r is typeof r & { extraction: NonNullable<typeof r.extraction> } =>
      r.extraction !== null,
    )
    .map((r) => ({ ...r.extraction, sourceUrl: r.sourceUrl } as ExtractedItem));
  log.info('Extract step done', {
    total: result.data.total,
    succeeded: succeeded.length,
    failed: result.data.failed,
  });
  return succeeded;
}

async function storeOrDryRun(
  unique: ExtractedItem[],
  sourceSite: string,
  extractOnly: boolean,
): Promise<StoreResult> {
  if (extractOnly) {
    log.info('Dry run — skipping store step', { uniqueItems: unique.length });
    return { inserted: 0, updated: 0, failed: 0, errors: [] };
  }
  return storeBatch(unique, sourceSite);
}

function buildResult(
  name: string,
  start: number,
  scraped: number,
  extracted: number,
  unique: number,
  stored: StoreResult,
  errors: string[],
): ScraperPipelineResult {
  const status: ScraperPipelineResult['status'] =
    scraped === 0 ? 'failed' :
    extracted === 0 || stored.failed > 0 ? 'partial' :
    'success';
  return {
    scraper: name, status, scraped, extracted, unique,
    stored: { inserted: stored.inserted, updated: stored.updated, failed: stored.failed },
    errors,
    durationMs: Date.now() - start,
  };
}

// ── Per-scraper pipeline ──────────────────────────────────────────────────────

async function runScraperPipeline(
  name: string,
  scraper: BaseScraper,
  options?: PipelineOptions,
): Promise<ScraperPipelineResult> {
  const start = Date.now();
  log.info(`Running scraper: ${name}`);

  try {
    const scrapeData = await scrapeStep(scraper, options?.limit);
    if (!scrapeData) {
      return buildResult(name, start, 0, 0, 0, { inserted: 0, updated: 0, failed: 1, errors: [] }, ['Scrape step failed or returned 0 pages']);
    }

    const extractedItems = await extractStep(scrapeData.pages);
    if (!extractedItems) {
      return buildResult(name, start, scrapeData.pages.length, 0, 0, { inserted: 0, updated: 0, failed: 0, errors: [] }, ['Extract step failed']);
    }
    if (extractedItems.length === 0) {
      return buildResult(name, start, scrapeData.pages.length, 0, 0, { inserted: 0, updated: 0, failed: 0, errors: [] }, ['Zero extractions succeeded']);
    }

    const dedupResult = await deduplicateBatch(extractedItems);
    log.info('Dedup complete', { scraper: name, ...dedupResult.stats });

    if (dedupResult.stats.uniqueCount === 0) {
      log.info('All items are duplicates — nothing to store', { scraper: name });
      return buildResult(name, start, scrapeData.pages.length, extractedItems.length, 0, { inserted: 0, updated: 0, failed: 0, errors: [] }, []);
    }

    const extractOnly = options?.extractOnly ?? false;
    const stored = await storeOrDryRun(dedupResult.unique, scrapeData.sourceSite, extractOnly);
    const errors = stored.errors.map((e) => e.error);
    return buildResult(name, start, scrapeData.pages.length, extractedItems.length, dedupResult.stats.uniqueCount, stored, errors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Scraper pipeline crashed', { scraper: name, error: message });
    return buildResult(name, start, 0, 0, 0, { inserted: 0, updated: 0, failed: 1, errors: [] }, [message]);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full pipeline for one or all scrapers sequentially.
 * One scraper's failure never blocks the others.
 * Always returns a PipelineResult — never throws.
 */
export async function runPipeline(options?: PipelineOptions): Promise<PipelineResult> {
  const start = Date.now();
  const requestedNames = options?.scrapers ?? Object.keys(SCRAPER_REGISTRY);
  const names = requestedNames.filter((name) => {
    if (!SCRAPER_REGISTRY[name]) {
      log.warn('Unknown scraper — skipping', { name });
      return false;
    }
    return true;
  });

  log.info('Starting pipeline', { scrapers: names, extractOnly: options?.extractOnly ?? false, limit: options?.limit });

  const results: ScraperPipelineResult[] = [];
  for (const name of names) {
    results.push(await runScraperPipeline(name, SCRAPER_REGISTRY[name]!(), options));
  }

  const totalInserted = results.reduce((s, r) => s + r.stored.inserted, 0);
  const totalUpdated = results.reduce((s, r) => s + r.stored.updated, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  const pipelineResult: PipelineResult = {
    results, totalInserted, totalUpdated, totalErrors, durationMs: Date.now() - start,
  };

  log.info('Pipeline complete', {
    scrapers: names.length,
    totalInserted,
    totalUpdated,
    totalErrors,
    durationMs: pipelineResult.durationMs,
  });

  try {
    await notifyPipelineSummary(pipelineResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('Telegram notification threw unexpectedly — pipeline result unaffected', { error: msg });
  }

  return pipelineResult;
}

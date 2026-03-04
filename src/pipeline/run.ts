/**
 * CLI entry point for the YouthAtlas scraper pipeline.
 *
 * Usage:
 *   pnpm pipeline                        → run all scrapers, full pipeline
 *   pnpm pipeline --scraper=youthop      → run only youthop
 *   pnpm pipeline --dry-run --limit=3    → scrape + extract 3 pages, don't store
 *
 * Exit codes:
 *   0 — every scraper result is 'success'
 *   1 — one or more scrapers returned 'partial' or 'failed'
 */
import { loadExtractionEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { runPipeline, type PipelineOptions } from '@/pipeline/orchestrator.js';

const log = createLogger('run');

/** Parse process.argv into PipelineOptions (no external deps). */
function parseArgs(): PipelineOptions {
  const argv = process.argv.slice(2);
  const options: PipelineOptions = {};

  for (const arg of argv) {
    if (arg.startsWith('--scraper=')) {
      options.scrapers = [arg.slice('--scraper='.length)];
    } else if (arg === '--dry-run') {
      options.extractOnly = true;
    } else if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.slice('--limit='.length), 10);
      if (!isNaN(n) && n > 0) options.limit = n;
    }
  }

  return options;
}

async function main(): Promise<void> {
  // Validate Supabase + Anthropic env vars before anything else
  loadExtractionEnv();

  const options = parseArgs();
  const result = await runPipeline(options);

  // Print per-scraper summary
  for (const r of result.results) {
    log.info(`Scraper result: ${r.scraper}`, {
      status: r.status,
      scraped: r.scraped,
      extracted: r.extracted,
      unique: r.unique,
      inserted: r.stored.inserted,
      updated: r.stored.updated,
      failed: r.stored.failed,
      durationMs: r.durationMs,
      errors: r.errors.length > 0 ? r.errors : undefined,
    });
  }

  log.info('Pipeline summary', {
    totalInserted: result.totalInserted,
    totalUpdated: result.totalUpdated,
    totalErrors: result.totalErrors,
    durationMs: result.durationMs,
  });

  const allSuccess = result.results.every((r) => r.status === 'success');
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  log.error('Run crashed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

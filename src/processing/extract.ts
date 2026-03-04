import { loadExtractionEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { YouthOpScraper } from '@/scrapers/youthop.js';
import { extractPages } from '@/processing/extractor.js';

const log = createLogger('extract-test');

async function main(): Promise<void> {
  // Validate env (need both Supabase and Anthropic)
  loadExtractionEnv();

  // 1. Scrape a small sample
  log.info('Running YouthOp scraper for extraction test (small sample)');
  const scraper = new YouthOpScraper();
  const scrapeResult = await scraper.run();

  if (scrapeResult.error) {
    log.error('Scraper failed', { error: scrapeResult.error.message });
    process.exit(1);
  }

  // Take only the first 5 pages for testing
  const samplePages = scrapeResult.data.pages.slice(0, 5);
  log.info(`Scraper produced ${scrapeResult.data.pages.length} pages, testing extraction on ${samplePages.length}`);

  // 2. Run extraction
  const extractResult = await extractPages(samplePages);

  if (extractResult.error) {
    log.error('Extraction batch failed', { error: extractResult.error.message });
    process.exit(1);
  }

  const { succeeded, failed, results } = extractResult.data;
  log.info('Extraction complete', { total: samplePages.length, succeeded, failed });

  // 3. Print results
  for (const result of results) {
    if (result.extraction) {
      log.info('Extracted opportunity', {
        title: result.extraction.title,
        type: result.extraction.type,
        organization: result.extraction.organization,
        deadline: result.extraction.deadline,
        regions: result.extraction.regions,
        is_fully_funded: result.extraction.is_fully_funded,
      });
    } else {
      log.error('Failed extraction', {
        url: result.sourceUrl,
        error: result.error,
      });
    }
  }
}

main().catch((err) => {
  log.error('Extract test crashed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

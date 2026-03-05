import { loadBaseEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { OpDeskScraper } from '@/scrapers/opdesk.js';

const log = createLogger('run-opdesk');

async function main(): Promise<void> {
  loadBaseEnv();

  log.info('Starting OpportunityDesk scraper');

  const scraper = new OpDeskScraper();
  const result = await scraper.run();

  if (result.error) {
    log.error('OpportunityDesk scraper failed', {
      code: result.error.code,
      message: result.error.message,
    });
    process.exit(1);
  }

  log.info('OpportunityDesk scraper completed', {
    runId: result.data.runId,
    found: result.data.stats.found,
    scraped: result.data.stats.scraped,
    errors: result.data.stats.errors,
  });

  const preview = result.data.pages.slice(0, 3);
  for (const page of preview) {
    log.info('Sample scraped page', {
      title: page.title,
      url: page.sourceUrl,
      htmlLength: page.rawHtml.length,
    });
  }
}

main().catch((err) => {
  log.error('Runner crashed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

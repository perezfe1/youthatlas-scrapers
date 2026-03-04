import { loadBaseEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';

const log = createLogger('pipeline');

async function main(): Promise<void> {
  // Validate env before doing anything
  loadBaseEnv();

  log.info('YouthAtlas scraper pipeline starting');
  log.info('No scrapers registered yet — add them in Module 1.2+');
  log.info('Pipeline finished');
}

main().catch((err) => {
  log.error('Pipeline crashed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

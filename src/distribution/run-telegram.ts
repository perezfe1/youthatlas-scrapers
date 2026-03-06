import { createLogger } from '@/lib/logger.js';
import { loadDistributionEnv } from '@/config/env.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import {
  getUnpostedOpportunities,
  distributeToTelegram,
} from '@/distribution/telegram-distributor.js';

const log = createLogger('distribute:telegram');

async function main(): Promise<void> {
  // Validate all required env vars up front — exits with clear error if any are missing
  loadDistributionEnv();

  log.info('Starting Telegram distribution run');

  // Fetch unposted opportunities
  const oppsResult = await getUnpostedOpportunities();
  if (oppsResult.error) {
    log.error('Failed to fetch unposted opportunities', { error: oppsResult.error.message });
    await sendTelegramMessage(
      `❌ <b>Distribution Failed</b>\n\nCould not fetch opportunities: ${oppsResult.error.message}`,
    );
    process.exit(1);
  }

  const opportunities = oppsResult.data;

  if (opportunities.length === 0) {
    log.info('No new opportunities to distribute');
    process.exit(0);
  }

  log.info(`Found ${opportunities.length} unposted opportunities — posting now`);

  // Distribute to public channel
  const distResult = await distributeToTelegram(opportunities);
  if (distResult.error) {
    log.error('Distribution failed', { error: distResult.error.message });
    await sendTelegramMessage(
      `❌ <b>Distribution Failed</b>\n\n${distResult.error.message}`,
    );
    process.exit(1);
  }

  const { posted, failed, skipped } = distResult.data;
  log.info(`Distribution complete: ${posted} posted, ${failed} failed, ${skipped} skipped`);

  // Admin notification via existing pipeline alert channel
  const lines = [
    `📤 <b>Distribution Complete</b>`,
    ``,
    `Posted: ${posted}`,
    `Failed: ${failed}`,
    `Skipped: ${skipped}`,
  ];
  const notifyResult = await sendTelegramMessage(lines.join('\n'));
  if (notifyResult.error) {
    log.warn('Failed to send admin notification', { error: notifyResult.error });
  }

  process.exit(0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[distribute:telegram] Fatal crash:', message);
  process.exit(1);
});

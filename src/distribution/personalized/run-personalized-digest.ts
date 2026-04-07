import { loadPersonalizedDigestEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import { getUsersForDigest, getDigestOpportunities, getClosingSoonOpportunities, getTrendingOpportunities } from './query.js';
import { sendPersonalizedDigests } from './sender.js';

const log = createLogger('personalized-digest');

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting personalized weekly digest');

  // Validate all required env vars at startup
  loadPersonalizedDigestEnv();

  // ── Step 1: Query eligible users ──────────────────────────────────────────

  const usersResult = await getUsersForDigest();

  if (usersResult.error) {
    log.error('Failed to query users for digest', {
      code: usersResult.error.code,
      message: usersResult.error.message,
    });
    await sendTelegramMessage(
      `❌ <b>Personalized Digest Failed</b>\n\nError querying users:\n${usersResult.error.message}`,
    );
    process.exit(1);
  }

  const users = usersResult.data;

  if (users.length === 0) {
    log.info('No eligible users for digest');
    await sendTelegramMessage(
      `📧 <b>Personalized Digest</b>\n\nNo eligible users this week. Skipped.`,
    );
    process.exit(0);
  }

  log.info('Eligible users found', { count: users.length });

  // ── Step 2: Query recent opportunities ────────────────────────────────────

  const oppsResult = await getDigestOpportunities(7);

  if (oppsResult.error) {
    log.error('Failed to query opportunities for digest', {
      code: oppsResult.error.code,
      message: oppsResult.error.message,
    });
    await sendTelegramMessage(
      `❌ <b>Personalized Digest Failed</b>\n\nError querying opportunities:\n${oppsResult.error.message}`,
    );
    process.exit(1);
  }

  const opportunities = oppsResult.data;

  if (opportunities.length === 0) {
    log.info('No new opportunities this week, skipping digest');
    await sendTelegramMessage(
      `📧 <b>Personalized Digest</b>\n\nNo new opportunities this week. Skipped.`,
    );
    process.exit(0);
  }

  log.info('Opportunities for digest', { count: opportunities.length });

  // ── Step 2b: Fetch closing-soon opportunities (non-fatal) ─────────────────

  const closingSoonResult = await getClosingSoonOpportunities(7);
  const closingSoonOpps = closingSoonResult.error ? [] : closingSoonResult.data;
  if (closingSoonResult.error) {
    log.warn('Failed to fetch closing-soon opportunities, proceeding without section', {
      error: closingSoonResult.error.message,
    });
  } else {
    log.info('Closing-soon opportunities', { count: closingSoonOpps.length });
  }

  // ── Step 2c: Fetch trending opportunities (non-fatal) ────────────────────

  const trendingResult = await getTrendingOpportunities(7, 2, 2);
  const trendingOpps = trendingResult.error ? [] : trendingResult.data;
  if (trendingResult.error) {
    log.warn('Failed to fetch trending opportunities, proceeding without section', {
      error: trendingResult.error.message,
    });
  } else {
    log.info('Trending opportunities', { count: trendingOpps.length });
  }

  // ── Step 3: Send personalized emails ──────────────────────────────────────

  const sendResult = await sendPersonalizedDigests(users, opportunities, closingSoonOpps, trendingOpps);

  if (sendResult.error) {
    log.error('Failed to send personalized digests', {
      code: sendResult.error.code,
      message: sendResult.error.message,
    });
    await sendTelegramMessage(
      `❌ <b>Personalized Digest Failed</b>\n\nError sending emails:\n${sendResult.error.message}`,
    );
    process.exit(1);
  }

  const { sent, failed, skipped, generic } = sendResult.data;

  // ── Step 4: Admin Telegram notification ───────────────────────────────────

  const adminMsg = [
    `📧 <b>Personalized Weekly Digest Sent</b>`,
    ``,
    `👥 Eligible users: ${users.length}`,
    `📊 Opportunities pool: ${opportunities.length}`,
    `✅ Sent: ${sent} (${sent - generic} personalized, ${generic} generic)`,
    `❌ Failed: ${failed}`,
    `⏭️ Skipped: ${skipped}`,
    `🔥 Trending section: ${trendingOpps.length} opp${trendingOpps.length !== 1 ? 's' : ''}`,
  ].join('\n');

  const notifyResult = await sendTelegramMessage(adminMsg);
  if (notifyResult.error) {
    log.warn('Failed to send admin Telegram notification', { error: notifyResult.error });
  } else {
    log.info('Admin notification sent to Telegram');
  }

  log.info('Personalized digest complete', { sent, failed, skipped, generic });
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in personalized digest:', err);
  process.exit(1);
});

import { loadRemindersEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import { getUsersWithUpcomingDeadlines } from './query.js';
import { sendReminderEmails } from './sender.js';

const log = createLogger('run-reminders');

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting deadline reminders job');

  // Validate all required env vars at startup
  loadRemindersEnv();

  // ── Step 1: Query users with upcoming deadlines ───────────────────────────

  const queryResult = await getUsersWithUpcomingDeadlines(3);

  if (queryResult.error) {
    log.error('Failed to query upcoming deadlines', {
      code: queryResult.error.code,
      message: queryResult.error.message,
    });
    await sendTelegramMessage(
      `❌ <b>Deadline Reminders Failed</b>\n\nError querying upcoming deadlines:\n${queryResult.error.message}`,
    );
    process.exit(1);
  }

  const reminders = queryResult.data;

  if (reminders.length === 0) {
    log.info('No reminders to send today');
    process.exit(0);
  }

  log.info('Users with upcoming deadlines found', { count: reminders.length });

  // ── Step 2: Send reminder emails ─────────────────────────────────────────

  const sendResult = await sendReminderEmails(reminders);

  if (sendResult.error) {
    log.error('Failed to send reminder emails', {
      code: sendResult.error.code,
      message: sendResult.error.message,
    });
    await sendTelegramMessage(
      `❌ <b>Deadline Reminders Failed</b>\n\nError sending emails:\n${sendResult.error.message}`,
    );
    process.exit(1);
  }

  const { sent, failed, skipped } = sendResult.data;

  log.info(`Reminders sent: ${sent} | Failed: ${failed} | Skipped: ${skipped}`);

  // ── Step 3: Admin Telegram notification ──────────────────────────────────

  const adminMsg = [
    `⏰ <b>Deadline Reminders Sent</b>`,
    ``,
    `📧 Sent: ${sent}`,
    `❌ Failed: ${failed}`,
    `⏭️ Skipped: ${skipped}`,
  ].join('\n');

  const notifyResult = await sendTelegramMessage(adminMsg);
  if (notifyResult.error) {
    log.warn('Failed to send admin Telegram notification', { error: notifyResult.error });
  } else {
    log.info('Admin notification sent to Telegram');
  }

  log.info('Deadline reminders job complete', { sent, failed, skipped });
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in deadline reminders:', err);
  process.exit(1);
});

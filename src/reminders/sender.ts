import { Resend } from 'resend';

import { loadRemindersEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { formatReminderEmail } from './email-template.js';
import { getOrCreateUnsubscribeToken } from './query.js';

import type { Result } from '@/types/opportunity.js';
import type { UserReminder, ReminderResult } from './types.js';

const log = createLogger('reminders-sender');

const FROM_ADDRESS = 'YouthAtlas <reminders@youthatlas.com>';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendReminderEmails(
  reminders: UserReminder[],
): Promise<Result<ReminderResult>> {
  const env = loadRemindersEnv();
  const resend = new Resend(env.RESEND_API_KEY);

  const result: ReminderResult = { sent: 0, failed: 0, skipped: 0 };

  for (const reminder of reminders) {
    // Fetch unsubscribe token — best-effort, email still sends without it
    let unsubscribeToken: string | undefined;
    const tokenResult = await getOrCreateUnsubscribeToken(reminder.userId);
    if (tokenResult.error) {
      log.warn('Failed to get unsubscribe token — sending without it', {
        userId: reminder.userId,
        error: tokenResult.error.message,
      });
    } else {
      unsubscribeToken = tokenResult.data;
    }

    const { subject, html } = formatReminderEmail(reminder, unsubscribeToken);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: reminder.email,
      subject,
      html,
    });

    if (error) {
      log.warn('Failed to send reminder email', {
        email: reminder.email,
        error: error.message,
      });
      result.failed++;
    } else {
      log.info(`Sent reminder to ${reminder.email} (${reminder.opportunities.length} opportunities)`);
      result.sent++;
    }

    // Respect Resend free-tier rate limit: 1 req/sec
    await sleep(1000);
  }

  return { data: result, error: null };
}

import { Resend } from 'resend';

import { createLogger } from '@/lib/logger.js';
import { matchOpportunitiesForUser } from './matcher.js';
import { formatPersonalizedDigest } from './email-template.js';
import type { Opportunity, Result } from '@/types/opportunity.js';
import type { DigestUser, PersonalizedDigestResult } from './types.js';

const log = createLogger('personalized-digest:sender');

const FROM_ADDRESS = 'YouthAtlas <digest@youthatlas.com>';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send personalized digest emails to all eligible users.
 * Each user gets opportunities filtered by their preferences.
 * Users with no preferences get the generic top-10 digest.
 */
export async function sendPersonalizedDigests(
  users: DigestUser[],
  opportunities: Opportunity[],
  closingSoonOpps: Opportunity[] = [],
): Promise<Result<PersonalizedDigestResult>> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { data: null, error: { code: 'MISSING_CONFIG', message: 'RESEND_API_KEY is not set' } };
  }

  const resend = new Resend(resendApiKey);
  const result: PersonalizedDigestResult = { sent: 0, skipped: 0, failed: 0, generic: 0 };

  for (const user of users) {
    // Match opportunities for this user
    const { opportunities: matched, isPersonalized } = matchOpportunitiesForUser(user, opportunities);

    if (matched.length === 0) {
      log.info('No opportunities to send, skipping user', { userId: user.id, email: user.email });
      result.skipped++;
      continue;
    }

    // Format the email
    const { subject, html } = formatPersonalizedDigest(user, matched, isPersonalized, closingSoonOpps);

    // Send via Resend
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email,
      subject,
      html,
    });

    if (error) {
      log.warn('Failed to send digest email', {
        email: user.email,
        error: error.message,
      });
      result.failed++;
    } else {
      log.info('Sent digest email', {
        email: user.email,
        opportunities: matched.length,
        personalized: isPersonalized,
      });
      result.sent++;
      if (!isPersonalized) result.generic++;
    }

    // Respect Resend free-tier rate limit: 1 req/sec
    await sleep(1000);
  }

  return { data: result, error: null };
}

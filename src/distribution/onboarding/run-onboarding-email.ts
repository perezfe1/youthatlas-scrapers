import { Resend } from 'resend';
import { createLogger } from '@/lib/logger.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { loadPersonalizedDigestEnv } from '@/config/env.js';
import { formatOnboardingEmail } from './email-template.js';

const log = createLogger('onboarding-email');
const FROM_ADDRESS = 'YouthAtlas <welcome@youthatlas.com>';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting onboarding email job');

  // Reuses same env as personalized digest (SUPABASE + RESEND + TELEGRAM)
  loadPersonalizedDigestEnv();

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    log.error('RESEND_API_KEY not set');
    process.exit(1);
  }

  const supabase = getSupabaseClient();
  const resend = new Resend(resendApiKey);

  // ── Step 1: Find users who signed up 20–28 hours ago, no onboarding email yet ──
  // The 20–28h window (not exactly 24h) prevents edge cases from slightly-offset runs.
  const windowStart = new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, display_name, onboarding_email_sent_at')
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    .is('onboarding_email_sent_at', null);

  if (profilesError) {
    log.error('Failed to query profiles', { error: profilesError.message });
    await sendTelegramMessage(
      `❌ <b>Onboarding Email Failed</b>\n\nFailed to query profiles:\n${profilesError.message}`,
    );
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    log.info('No users eligible for onboarding email this run');
    process.exit(0);
  }

  log.info('Users eligible for onboarding email', { count: profiles.length });

  // ── Step 2: Get emails from auth admin API ────────────────────────────────
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });

  if (authError) {
    log.error('Failed to list auth users', { error: authError.message });
    await sendTelegramMessage(
      `❌ <b>Onboarding Email Failed</b>\n\nFailed to list auth users:\n${authError.message}`,
    );
    process.exit(1);
  }

  const emailMap = new Map(
    authData.users
      .filter(u => u.email)
      .map(u => [u.id, u.email!]),
  );

  // ── Step 3: Send and mark ─────────────────────────────────────────────────
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const profile of profiles as Array<{
    id: string;
    display_name: string | null;
    onboarding_email_sent_at: string | null;
  }>) {
    const email = emailMap.get(profile.id);
    if (!email) {
      log.info('No email found for user, skipping', { userId: profile.id });
      skipped++;
      continue;
    }

    const { subject, html } = formatOnboardingEmail({
      id: profile.id,
      email,
      display_name: profile.display_name,
    });

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject,
      html,
    });

    if (error) {
      log.warn('Failed to send onboarding email', { email, error: error.message });
      failed++;
    } else {
      // Mark as sent so we never re-send
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ onboarding_email_sent_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (updateError) {
        log.warn('Failed to mark onboarding email as sent', {
          userId: profile.id,
          error: updateError.message,
        });
      }

      log.info('Sent onboarding email', { email });
      sent++;
    }

    // Respect Resend rate limit: 1 req/sec
    await sleep(1000);
  }

  // ── Step 4: Admin notification ────────────────────────────────────────────
  if (sent > 0 || failed > 0) {
    await sendTelegramMessage(
      [
        `📬 <b>Onboarding Emails Sent</b>`,
        ``,
        `✅ Sent: ${sent}`,
        `❌ Failed: ${failed}`,
        `⏭️ Skipped (no email): ${skipped}`,
      ].join('\n'),
    );
  }

  log.info('Onboarding email job complete', { sent, failed, skipped });
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in onboarding email job:', err);
  process.exit(1);
});

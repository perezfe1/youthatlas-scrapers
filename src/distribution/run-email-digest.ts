import { loadEmailEnv } from '@/config/env.js';
import { EMAIL_DIGEST } from '@/config/constants.js';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import { formatWeeklyDigest } from '@/distribution/email-formatter.js';
import { sendBroadcast } from '@/distribution/kit-client.js';
import { recordDistribution } from '@/distribution/telegram-distributor.js';
import type { Opportunity } from '@/types/opportunity.js';

const log = createLogger('email-digest');

// ── DB query ───────────────────────────────────────────────────────────────────

async function getWeeklyOpportunities(): Promise<Opportunity[]> {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0]!;
  const lookbackDate = new Date(
    Date.now() - EMAIL_DIGEST.LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'active')
    .gte('created_at', lookbackDate)
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order('completeness_score', { ascending: false })
    .limit(EMAIL_DIGEST.MAX_OPPORTUNITIES);

  if (error) {
    throw new Error(`Failed to query opportunities: ${error.message}`);
  }

  return (data ?? []) as Opportunity[];
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting weekly email digest');

  // Validate all required env vars at startup
  loadEmailEnv();

  // ── Step 1: Query opportunities ──────────────────────────────────────────────

  let opportunities: Opportunity[];
  try {
    opportunities = await getWeeklyOpportunities();
  } catch (err) {
    log.error('Failed to query opportunities', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  if (opportunities.length === 0) {
    log.info('No new opportunities this week, skipping digest');
    process.exit(0);
  }

  log.info('Fetched opportunities for digest', { count: opportunities.length });

  // ── Step 2: Format email ─────────────────────────────────────────────────────

  const { subject, html } = formatWeeklyDigest(opportunities);
  log.info('Formatted digest email', { subject, htmlBytes: html.length });

  // ── Step 3: Send broadcast ───────────────────────────────────────────────────

  const broadcastResult = await sendBroadcast(subject, html);

  if (broadcastResult.error) {
    log.error('Failed to create Kit broadcast', {
      code: broadcastResult.error.code,
      message: broadcastResult.error.message,
    });
    process.exit(1);
  }

  const { broadcastId } = broadcastResult.data;
  log.info('Kit broadcast created successfully', { broadcastId });

  // ── Step 4: Record in distribution_log ──────────────────────────────────────

  let recorded = 0;
  for (const opp of opportunities) {
    const result = await recordDistribution(opp.id, 'email_digest', String(broadcastId));
    if (!result.error) {
      recorded++;
    } else {
      log.warn('Failed to record distribution log entry', {
        opportunityId: opp.id,
        error: result.error.message,
      });
    }
  }

  log.info('Recorded distribution log entries', {
    recorded,
    total: opportunities.length,
  });

  // ── Step 5: Admin Telegram notification ─────────────────────────────────────

  const adminMsg = [
    `📧 <b>Weekly Email Digest Sent</b>`,
    ``,
    `📬 Broadcast ID: ${broadcastId}`,
    `📊 Opportunities included: ${opportunities.length}`,
    `✅ Log entries recorded: ${recorded}`,
    ``,
    `<i>Review and publish in the Kit dashboard.</i>`,
  ].join('\n');

  const notifyResult = await sendTelegramMessage(adminMsg);
  if (notifyResult.error) {
    log.warn('Failed to send admin Telegram notification', { error: notifyResult.error });
  } else {
    log.info('Admin notification sent to Telegram');
  }

  log.info('Weekly email digest complete', { broadcastId, opportunities: opportunities.length });
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in email digest:', err);
  process.exit(1);
});

import { loadEmailEnv } from '@/config/env.js';
import { EMAIL_DIGEST } from '@/config/constants.js';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import { formatWeeklyDigest, type FeaturedListingEmail } from '@/distribution/email-formatter.js';
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

  // Only select columns needed for email formatting — never select embedding or fts
  const EMAIL_COLUMNS = [
    'id', 'title', 'slug', 'type', 'summary', 'organization',
    'regions', 'deadline', 'is_rolling', 'is_fully_funded',
    'completeness_score', 'created_at', 'status',
    'application_url', 'source_url',
  ].join(',');

  const { data, error } = await supabase
    .from('opportunities')
    .select(EMAIL_COLUMNS)
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

  // ── Step 1b: Query featured listings ────────────────────────────────────────

  let featuredListings: FeaturedListingEmail[] = [];
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const { data: featuredData, error: featuredError } = await supabase
      .from('featured_listings')
      .select('org_name, opportunity_title, opportunity_url, opportunity_description')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (featuredError) {
      log.warn('Failed to query featured listings', { error: featuredError.message });
    } else if (featuredData && featuredData.length > 0) {
      featuredListings = featuredData.map((row) => ({
        orgName: row.org_name as string,
        opportunityTitle: row.opportunity_title as string,
        opportunityUrl: row.opportunity_url as string,
        opportunityDescription: (row.opportunity_description as string) ?? null,
      }));
      log.info('Fetched featured listings for digest', { count: featuredListings.length });
    }
  } catch (err) {
    log.warn('Failed to query featured listings — proceeding without', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 2: Format email ─────────────────────────────────────────────────────

  const { subject, html } = formatWeeklyDigest(opportunities, featuredListings);
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

import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { sendTelegramMessageToChannel } from '@/lib/telegram.js';
import { DISTRIBUTION } from '@/config/constants.js';
import { formatOpportunityPost, formatDigestHeader } from '@/distribution/telegram-formatter.js';
import type { Opportunity, Result } from '@/types/opportunity.js';

const log = createLogger('telegram-distributor');

// ── Types ─────────────────────────────────────────────────────────────────────

export type DistributionResult = {
  posted: number;
  failed: number;
  skipped: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dbError(code: string, message: string): { data: null; error: { code: string; message: string } } {
  return { data: null, error: { code, message } };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch active, non-expired opportunities that have NOT yet been posted
 * to Telegram, created within the last LOOKBACK_HOURS hours.
 * Ordered by completeness_score DESC, limited to MAX_PER_RUN.
 */
export async function getUnpostedOpportunities(): Promise<Result<Opportunity[]>> {
  try {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0]!;
    const lookbackDate = new Date(
      Date.now() - DISTRIBUTION.LOOKBACK_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Step 1: collect already-posted opportunity IDs for this channel
    const { data: posted, error: logError } = await supabase
      .from('distribution_log')
      .select('opportunity_id')
      .eq('channel', 'telegram');

    if (logError) {
      return dbError('DB_ERROR', `Failed to query distribution_log: ${logError.message}`);
    }

    const postedIds = (posted ?? []).map(
      (r: { opportunity_id: string }) => r.opportunity_id,
    );

    // Step 2: query unposted active opportunities within the lookback window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('opportunities')
      .select('*')
      .eq('status', 'active')
      .gte('created_at', lookbackDate)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order('completeness_score', { ascending: false })
      .limit(DISTRIBUTION.MAX_PER_RUN);

    if (postedIds.length > 0) {
      q = q.not('id', 'in', `(${postedIds.join(',')})`);
    }

    const { data, error } = await q;

    if (error) {
      return dbError('DB_ERROR', `Failed to query opportunities: ${error.message}`);
    }

    return { data: (data ?? []) as Opportunity[], error: null };
  } catch (err) {
    return dbError('UNEXPECTED', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Insert a row into distribution_log to record that an opportunity was posted.
 * On conflict (already recorded), skips silently.
 */
export async function recordDistribution(
  opportunityId: string,
  channel: string,
  externalId?: string,
): Promise<Result<null>> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('distribution_log')
      .upsert(
        {
          opportunity_id: opportunityId,
          channel,
          posted_at: new Date().toISOString(),
          external_id: externalId ?? null,
        },
        { onConflict: 'opportunity_id,channel', ignoreDuplicates: true },
      );

    if (error) {
      return dbError('DB_ERROR', `Failed to record distribution: ${error.message}`);
    }

    return { data: null, error: null };
  } catch (err) {
    return dbError('UNEXPECTED', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Post a batch of opportunities to the public Telegram channel.
 * Sends a digest header first, then one message per opportunity with rate limiting.
 * Records each successful post in distribution_log.
 * Individual failures are logged and counted but never abort the run.
 */
export async function distributeToTelegram(
  opportunities: Opportunity[],
): Promise<Result<DistributionResult>> {
  const result: DistributionResult = { posted: 0, failed: 0, skipped: 0 };

  if (opportunities.length === 0) {
    return { data: result, error: null };
  }

  const channelId = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
  if (!channelId) {
    return dbError('MISSING_CONFIG', 'TELEGRAM_PUBLIC_CHANNEL_ID is not set');
  }

  // Send digest header (best-effort — failure doesn't block individual posts)
  const header = formatDigestHeader(opportunities.length);
  const headerResult = await sendTelegramMessageToChannel(channelId, header);
  if (headerResult.error) {
    log.warn('Failed to send digest header — continuing with individual posts', {
      error: headerResult.error.message,
    });
  }

  // Send each opportunity with rate-limiting between messages
  for (const opp of opportunities) {
    await sleep(DISTRIBUTION.RATE_LIMIT_MS);

    const text = formatOpportunityPost(opp);
    const sendResult = await sendTelegramMessageToChannel(channelId, text);

    if (sendResult.error) {
      log.warn('Failed to post opportunity', {
        id: opp.id,
        title: opp.title,
        error: sendResult.error.message,
      });
      result.failed++;
      continue;
    }

    const externalId = String(sendResult.data.messageId);
    const recordResult = await recordDistribution(opp.id, 'telegram', externalId);
    if (recordResult.error) {
      // Message was sent — still count as posted, just log the record failure
      log.warn('Posted but failed to record in distribution_log', {
        id: opp.id,
        error: recordResult.error.message,
      });
    }

    log.info('Posted opportunity', { title: opp.title, messageId: externalId });
    result.posted++;
  }

  return { data: result, error: null };
}

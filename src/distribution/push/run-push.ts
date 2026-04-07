import { loadPushEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { sendTelegramMessage } from '@/lib/telegram.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { getAllPushSubscriptions, sendPushNotifications } from './sender.js';
import type { Opportunity } from '@/types/opportunity.js';
import type { PushPayload } from './types.js';

const log = createLogger('push-notifications');

// Columns needed — never select embedding or fts
const PUSH_COLUMNS = 'id, title, slug, type, organization, is_fully_funded, created_at, status';

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting push notification job');

  // Validate env
  loadPushEnv();

  // Step 1: Get subscriptions
  const subsResult = await getAllPushSubscriptions();

  if (subsResult.error) {
    log.error('Failed to query push subscriptions', {
      code: subsResult.error.code,
      message: subsResult.error.message,
    });
    process.exit(1);
  }

  const subscriptions = subsResult.data;

  if (subscriptions.length === 0) {
    log.info('No push subscribers, skipping');
    process.exit(0);
  }

  log.info('Push subscribers found', { count: subscriptions.length });

  // Step 2: Get recently added opportunities (last 24 hours)
  const supabase = getSupabaseClient();
  const lookbackDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0]!;

  const { data: opps, error: oppsError } = await supabase
    .from('opportunities')
    .select(PUSH_COLUMNS)
    .eq('status', 'active')
    .gte('created_at', lookbackDate)
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order('completeness_score', { ascending: false })
    .limit(5);

  if (oppsError) {
    log.error('Failed to query opportunities', { error: oppsError.message });
    process.exit(1);
  }

  const opportunities = (opps ?? []) as unknown as Opportunity[];

  if (opportunities.length === 0) {
    log.info('No new opportunities in last 24h, skipping push');
    process.exit(0);
  }

  log.info('New opportunities for push', { count: opportunities.length });

  // Step 3: Build payload
  const topOpp = opportunities[0]!;
  const payload: PushPayload = opportunities.length === 1
    ? {
        title: topOpp.title,
        body: topOpp.organization
          ? `${topOpp.organization}${topOpp.is_fully_funded ? ' · Fully Funded' : ''}`
          : 'New opportunity on YouthAtlas',
        url: `/opportunities/${topOpp.slug}`,
      }
    : {
        title: `${opportunities.length} new opportunities added`,
        body: `Including: ${topOpp.title}${topOpp.is_fully_funded ? ' (Fully Funded)' : ''}`,
        url: '/opportunities',
      };

  // Step 4: Send push to all subscribers
  const pushResult = await sendPushNotifications(subscriptions, payload);

  if (pushResult.error) {
    log.error('Push send failed', {
      code: pushResult.error.code,
      message: pushResult.error.message,
    });
    await sendTelegramMessage(
      `❌ <b>Push Notifications Failed</b>\n\n${pushResult.error.message}`,
    );
    process.exit(1);
  }

  const { sent, failed, expired } = pushResult.data;

  // Step 5: Admin notification
  const adminMsg = [
    `🔔 <b>Push Notifications Sent</b>`,
    ``,
    `📊 New opportunities: ${opportunities.length}`,
    `✅ Sent: ${sent}`,
    `❌ Failed: ${failed}`,
    `🗑️ Expired (removed): ${expired}`,
  ].join('\n');

  await sendTelegramMessage(adminMsg);
  log.info('Push notification job complete', { sent, failed, expired });
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in push notifications:', err);
  process.exit(1);
});

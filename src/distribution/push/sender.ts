import webpush from 'web-push';

import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import type { Result } from '@/types/opportunity.js';
import type { PushSubscription, PushPayload, PushResult } from './types.js';

const log = createLogger('push-sender');

// ── Query ────────────────────────────────────────────────────────────────────

export async function getAllPushSubscriptions(): Promise<Result<PushSubscription[]>> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_id');

    if (error) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to query push_subscriptions: ${error.message}` } };
    }

    return { data: (data ?? []) as PushSubscription[], error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────

/**
 * Send a push notification to all subscribed browsers.
 * Automatically removes expired subscriptions (410 Gone).
 */
export async function sendPushNotifications(
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<Result<PushResult>> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { data: null, error: { code: 'MISSING_CONFIG', message: 'VAPID keys not set' } };
  }

  webpush.setVapidDetails(
    'mailto:hello@youthatlas.com',
    vapidPublicKey,
    vapidPrivateKey,
  );

  const result: PushResult = { sent: 0, failed: 0, expired: 0 };
  const supabase = getSupabaseClient();
  const payloadStr = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payloadStr,
      );
      result.sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;

      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired — remove from DB
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id);
        result.expired++;
        log.info('Removed expired push subscription', { id: sub.id });
      } else {
        result.failed++;
        log.warn('Failed to send push notification', {
          id: sub.id,
          statusCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { data: result, error: null };
}

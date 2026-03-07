import { createLogger } from '@/lib/logger.js';
import type { Result } from '@/types/opportunity.js';

const log = createLogger('kit-client');

const KIT_V4 = 'https://api.kit.com/v4';
const KIT_V3 = 'https://api.convertkit.com/v3';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KitSubscriber {
  id: number;
  email: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiError(code: string, message: string): { data: null; error: { code: string; message: string } } {
  return { data: null, error: { code, message } };
}

function getApiSecret(): string | null {
  return process.env.KIT_API_SECRET ?? null;
}

// ── getSubscribers ─────────────────────────────────────────────────────────────

/**
 * Fetch all active subscribers from Kit via API v4.
 * Paginates automatically using cursor-based pagination (50 per page).
 */
export async function getSubscribers(): Promise<Result<KitSubscriber[]>> {
  const apiSecret = getApiSecret();
  if (!apiSecret) {
    return apiError('MISSING_CREDENTIALS', 'KIT_API_SECRET is not configured');
  }

  const subscribers: KitSubscriber[] = [];
  let cursor: string | null = null;

  try {
    do {
      const url = new URL(`${KIT_V4}/subscribers`);
      url.searchParams.set('status', 'active');
      if (cursor) url.searchParams.set('after', cursor);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);

      try {
        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${apiSecret}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return apiError('HTTP_ERROR', `HTTP ${res.status}: ${body}`);
        }

        const json = (await res.json()) as {
          subscribers: Array<{ id: number; email_address: string }>;
          pagination: { has_next_page: boolean; end_cursor: string | null };
        };

        for (const s of json.subscribers) {
          subscribers.push({ id: s.id, email: s.email_address });
        }

        cursor = json.pagination.has_next_page ? (json.pagination.end_cursor ?? null) : null;
      } finally {
        clearTimeout(timer);
      }
    } while (cursor !== null);

    log.info('Fetched Kit subscribers', { count: subscribers.length });
    return { data: subscribers, error: null };
  } catch (err) {
    return apiError('FETCH_ERROR', err instanceof Error ? err.message : String(err));
  }
}

// ── sendBroadcast ──────────────────────────────────────────────────────────────

/**
 * Create a broadcast draft in Kit via API v3.
 * The broadcast will appear in the Kit dashboard for review before sending.
 * Returns the broadcast ID.
 */
export async function sendBroadcast(
  subject: string,
  htmlContent: string,
): Promise<Result<{ broadcastId: number }>> {
  const apiSecret = getApiSecret();
  if (!apiSecret) {
    return apiError('MISSING_CREDENTIALS', 'KIT_API_SECRET is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${KIT_V3}/broadcasts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_secret: apiSecret,
        subject,
        content: htmlContent,
        description: 'YouthAtlas Weekly Digest',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return apiError('HTTP_ERROR', `HTTP ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { broadcast: { id: number } };
    const broadcastId = json.broadcast.id;

    log.info('Kit broadcast created', { broadcastId, subject });
    return { data: { broadcastId }, error: null };
  } catch (err) {
    return apiError('FETCH_ERROR', err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

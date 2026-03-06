import { createLogger } from '@/lib/logger.js';
import type { PipelineResult } from '@/pipeline/orchestrator.js';
import type { Result } from '@/types/opportunity.js';

const log = createLogger('telegram');

// ── Core send ────────────────────────────────────────────────────────────────

export async function sendTelegramMessage(
  text: string,
): Promise<{ data: true; error: null } | { data: null; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !chatId) {
    log.debug('Telegram credentials not configured — skipping notification');
    return { data: true, error: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: `HTTP ${res.status}: ${body}` };
    }
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a message to any Telegram channel by ID.
 * Unlike sendTelegramMessage, this takes the channelId as a parameter
 * (not from env) and returns the Telegram message_id for tracking.
 */
export async function sendTelegramMessageToChannel(
  channelId: string,
  text: string,
  parseMode: 'HTML' = 'HTML',
): Promise<Result<{ messageId: number }>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return { data: null, error: { code: 'MISSING_CREDENTIALS', message: 'TELEGRAM_BOT_TOKEN not configured' } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: channelId, text, parse_mode: parseMode }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: { code: 'HTTP_ERROR', message: `HTTP ${res.status}: ${body}` } };
    }

    const json = (await res.json()) as { ok: boolean; result: { message_id: number } };
    return { data: { messageId: json.result.message_id }, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'FETCH_ERROR', message: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Message formatters ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function buildSummaryMessage(result: PipelineResult): string {
  const allFailed = result.results.every((r) => r.status === 'failed');
  const anyIssue = result.results.some((r) => r.status === 'failed' || r.status === 'partial');

  const emoji = allFailed ? '❌' : anyIssue ? '⚠️' : '✅';
  const header = allFailed
    ? 'Pipeline Failed'
    : anyIssue
      ? 'Pipeline Complete (with issues)'
      : 'Pipeline Complete';

  const lines = [
    `${emoji} <b>YouthAtlas ${header}</b>`,
    '',
    `Scrapers: ${result.results.length} run`,
    `Inserted: ${result.totalInserted} | Updated: ${result.totalUpdated} | Errors: ${result.totalErrors}`,
    `Duration: ${formatDuration(result.durationMs)}`,
    '',
    '<b>Per scraper:</b>',
  ];

  for (const r of result.results) {
    const stored = r.stored.inserted + r.stored.updated;
    lines.push(`• ${r.scraper}: ${r.scraped} scraped → ${r.extracted} extracted → ${stored} stored`);
  }

  return lines.join('\n');
}

// ── Public notification helpers ───────────────────────────────────────────────

export async function notifyPipelineSummary(result: PipelineResult): Promise<void> {
  const text = buildSummaryMessage(result);
  const outcome = await sendTelegramMessage(text);
  if (outcome.error) {
    log.warn('Failed to send pipeline summary to Telegram', { error: outcome.error });
  } else {
    log.info('Pipeline summary sent to Telegram');
  }
}

/** Alias for notifyPipelineSummary — kept for clarity at call sites. */
export const notifyPipelineSuccess = notifyPipelineSummary;

export async function notifyPipelineFailure(scraperName: string, error: string): Promise<void> {
  const truncated = error.length > 500 ? `${error.slice(0, 500)}…` : error;
  const text = `❌ <b>Scraper Failed: ${scraperName}</b>\n\nError: ${truncated}`;
  const outcome = await sendTelegramMessage(text);
  if (outcome.error) {
    log.warn('Failed to send failure alert to Telegram', { error: outcome.error });
  }
}

import { createHash } from 'crypto';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import type { ExtractedItem } from '@/processing/deduplication.js';

const log = createLogger('store');

// ── Types ────────────────────────────────────────────────────────────────────

export type StoreResult = {
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ sourceUrl: string; error: string }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from the title plus an 8-char hash suffix derived
 * from the source URL. The suffix guarantees uniqueness per listing even when
 * two listings share the same title.
 *
 * Example: "global scholars program 2026" + hash("https://…") → "global-scholars-program-2026-a1b2c3d4"
 */
function generateSlug(title: string, sourceUrl: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 60)
    .replace(/-$/, ''); // strip trailing dash if title was exactly 60 chars

  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

/**
 * Compute a completeness score (0–100) based on which fields are populated.
 * Used for search ranking and quality filtering on the frontend.
 */
function computeCompletenessScore(item: ExtractedItem): number {
  let score = 0;
  if (item.title) score += 20;
  if (item.description && item.description.length > 50) score += 20;
  if (item.deadline) score += 15;
  if (item.organization) score += 15;
  if (item.application_url) score += 15;
  if (item.funding_amount) score += 10;
  if (item.eligibility_text) score += 5;
  return Math.min(score, 100);
}

/** Map an ExtractedItem to the opportunities table column shape. */
function toDbRow(item: ExtractedItem, sourceSite: string): Record<string, unknown> {
  return {
    title: item.title,
    slug: generateSlug(item.title, item.sourceUrl),
    description: item.description,
    summary: item.summary,
    type: item.type,
    fields: item.fields,
    regions: item.regions,
    countries: item.countries,
    target_audience: item.target_audience,
    eligibility_text: item.eligibility_text,
    deadline: item.deadline ?? null,
    is_rolling: item.is_rolling,
    funding_amount: item.funding_amount ?? null,
    is_fully_funded: item.is_fully_funded,
    source_url: item.sourceUrl,
    source_site: sourceSite,
    organization: item.organization,
    application_url: item.application_url ?? null,
    status: 'active',
    ai_processed: true,
    completeness_score: computeCompletenessScore(item),
    updated_at: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Flag a listing for human review.
 * Best-effort — errors are logged but never thrown.
 */
export async function flagOpportunity(
  sourceUrl: string,
  reason: string,
  details?: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const detailsText = details
      ? `URL: ${sourceUrl}\n${details}`
      : `URL: ${sourceUrl}`;

    const { error } = await supabase.from('flagged_listings').insert({
      flag_reason: reason,
      details: detailsText,
      auto_flagged: true,
      reviewed: false,
    });

    if (error) {
      log.warn('Failed to insert flagged listing', { sourceUrl, reason, dbError: error.message });
    }
  } catch (err) {
    log.warn('flagOpportunity crashed', {
      sourceUrl,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Upsert a batch of deduplicated ExtractedItems into the opportunities table.
 *
 * Strategy:
 * 1. Batch-query existing source_urls → build a Set to classify each item as
 *    insert or update before upserting (avoids per-row DB reads).
 * 2. Upsert each item on conflict target `slug` (the only unique column besides id).
 *    The slug is deterministically derived from title + source URL hash, so the
 *    same listing always maps to the same slug across pipeline runs.
 * 3. Return counts of inserts, updates, and failures.
 */
export async function storeBatch(
  items: ExtractedItem[],
  sourceSite: string,
): Promise<StoreResult> {
  const result: StoreResult = { inserted: 0, updated: 0, failed: 0, errors: [] };

  if (items.length === 0) {
    log.info('storeBatch called with empty list — nothing to do');
    return result;
  }

  log.info('Starting store batch', { count: items.length, sourceSite });

  const supabase = getSupabaseClient();

  // Step 1: batch-query existing source_urls to classify insert vs update
  const sourceUrls = items.map((i) => i.sourceUrl);
  const { data: existing, error: queryError } = await supabase
    .from('opportunities')
    .select('source_url')
    .in('source_url', sourceUrls);

  if (queryError) {
    log.warn('Failed to pre-query existing source_urls — treating all as inserts', {
      error: queryError.message,
    });
  }

  const existingUrls = new Set(
    (existing ?? []).map((r: { source_url: string }) => r.source_url),
  );

  log.info('Pre-query classification', {
    total: items.length,
    existingInDb: existingUrls.size,
    newItems: items.length - existingUrls.size,
  });

  // Step 2: upsert each item
  for (const item of items) {
    const isUpdate = existingUrls.has(item.sourceUrl);
    const row = toDbRow(item, sourceSite);

    try {
      const { error } = await supabase
        .from('opportunities')
        .upsert(row, { onConflict: 'slug' });

      if (error) {
        log.warn('Upsert failed', { sourceUrl: item.sourceUrl, error: error.message });
        result.failed++;
        result.errors.push({ sourceUrl: item.sourceUrl, error: error.message });
        continue;
      }

      if (isUpdate) {
        log.debug('Updated existing opportunity', { title: item.title });
        result.updated++;
      } else {
        log.debug('Inserted new opportunity', { title: item.title });
        result.inserted++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Upsert crashed', { sourceUrl: item.sourceUrl, error: message });
      result.failed++;
      result.errors.push({ sourceUrl: item.sourceUrl, error: message });
    }
  }

  log.info('Store batch complete', result);
  return result;
}

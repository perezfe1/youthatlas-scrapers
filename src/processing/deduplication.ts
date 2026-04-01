import { createHash } from 'crypto';
import * as fuzzball from 'fuzzball';
import { DEDUPLICATION } from '@/config/constants.js';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import type { ExtractedOpportunity } from '@/types/opportunity.js';

const log = createLogger('deduplication');

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * ExtractedOpportunity enriched with the scraping-stage source URL.
 * The source URL is not part of Claude's extraction output but is required
 * for hash generation and duplicate detection.
 */
export type ExtractedItem = ExtractedOpportunity & { sourceUrl: string };

export type DuplicateMatch = {
  item: ExtractedItem;
  matchedTitle: string;
  matchType: 'hash' | 'url' | 'fuzzy';
  score: number; // 100 for hash matches, actual fuzzball score for fuzzy
};

export type DeduplicationResult = {
  unique: ExtractedItem[];
  duplicates: DuplicateMatch[];
  stats: {
    total: number;
    uniqueCount: number;
    hashDuplicates: number;
    urlDuplicates: number;
    fuzzyDuplicates: number;
  };
};

// Internal type for the comparison pool (DB records + confirmed-unique batch items)
type PoolRecord = {
  title: string;
  normalizedTitle: string;
  hash: string;
};

// ── String helpers ────────────────────────────────────────────────────────────

/** Normalise a string for hash input: lowercase, remove punctuation, collapse spaces. */
function normalizeForHash(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/** Normalise a title for fuzzy comparison: strip years and common filler words. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, '')          // remove years (2025, 2026, …)
    .replace(/[^\w\s]/g, '')               // remove punctuation
    .replace(/\b(the|for|in|of|and|a|an)\b/g, '') // remove filler words
    .replace(/\s+/g, ' ')
    .trim();
}

/** SHA-256 hash of normalised title + source URL. Catches identical listings. */
export function generateHash(title: string, sourceUrl: string): string {
  const input = `${normalizeForHash(title)}|${normalizeForHash(sourceUrl)}`;
  return createHash('sha256').update(input).digest('hex');
}

// ── Pool helpers ──────────────────────────────────────────────────────────────

function toPoolRecord(title: string, sourceUrl: string): PoolRecord {
  return {
    title,
    normalizedTitle: normalizeTitle(title),
    hash: generateHash(title, sourceUrl),
  };
}

function checkHashAgainstPool(hash: string, pool: PoolRecord[]): string | null {
  return pool.find((r) => r.hash === hash)?.title ?? null;
}

function checkFuzzyAgainstPool(
  normalizedTitle: string,
  pool: PoolRecord[],
): { title: string; score: number } | null {
  let bestScore = 0;
  let bestTitle = '';

  for (const record of pool) {
    const score = fuzzball.token_sort_ratio(normalizedTitle, record.normalizedTitle);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = record.title;
    }
  }

  if (bestScore >= DEDUPLICATION.FUZZY_THRESHOLD) {
    return { title: bestTitle, score: bestScore };
  }
  return null;
}

// ── Phase 1: Intra-batch hash dedup ──────────────────────────────────────────

function intraBatchHashDedup(items: ExtractedItem[]): {
  unique: ExtractedItem[];
  duplicates: DuplicateMatch[];
} {
  const seen = new Map<string, string>(); // hash → first-seen title
  const unique: ExtractedItem[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const item of items) {
    const hash = generateHash(item.title, item.sourceUrl);
    const existing = seen.get(hash);

    if (existing !== undefined) {
      log.info('Intra-batch hash duplicate', { title: item.title, matchedTitle: existing });
      duplicates.push({ item, matchedTitle: existing, matchType: 'hash', score: 100 });
    } else {
      seen.set(hash, item.title);
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

// ── Phase 1b: URL-based cross-batch dedup ────────────────────────────────────

/**
 * Check each item's sourceUrl and application_url against existing DB records.
 * If a URL already exists in opportunities.source_url or opportunities.application_url,
 * the item is a duplicate. Falls back gracefully — never blocks the pipeline.
 */
async function urlBasedDedup(items: ExtractedItem[]): Promise<{
  unique: ExtractedItem[];
  duplicates: DuplicateMatch[];
}> {
  const allUrls = [
    ...items.map((i) => i.sourceUrl),
    ...items.map((i) => i.application_url).filter((u): u is string => u !== null),
  ];

  if (allUrls.length === 0) return { unique: items, duplicates: [] };

  let seenUrls = new Set<string>();

  try {
    const supabase = getSupabaseClient();
    const [sourceRes, appRes] = await Promise.all([
      supabase.from('opportunities').select('source_url').in('source_url', allUrls),
      supabase.from('opportunities').select('application_url').in('application_url', allUrls),
    ]);

    if (sourceRes.error || appRes.error) {
      log.warn('URL dedup DB query error — skipping URL dedup phase', {
        sourceError: sourceRes.error?.message,
        appError: appRes.error?.message,
      });
      return { unique: items, duplicates: [] };
    }

    for (const row of sourceRes.data ?? []) {
      if (row.source_url) seenUrls.add(row.source_url as string);
    }
    for (const row of appRes.data ?? []) {
      if (row.application_url) seenUrls.add(row.application_url as string);
    }
  } catch (err) {
    log.warn('URL dedup query crashed — skipping URL dedup phase', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { unique: items, duplicates: [] };
  }

  const unique: ExtractedItem[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const item of items) {
    const matchedUrl =
      (item.sourceUrl && seenUrls.has(item.sourceUrl) ? item.sourceUrl : null) ??
      (item.application_url && seenUrls.has(item.application_url) ? item.application_url : null);

    if (matchedUrl) {
      log.info(`URL duplicate ${item.title} matched existing URL ${matchedUrl}`);
      duplicates.push({ item, matchedTitle: matchedUrl, matchType: 'url', score: 100 });
    } else {
      unique.push(item);
    }
  }

  return { unique, duplicates };
}

// ── DB fetch ──────────────────────────────────────────────────────────────────

/** Fetch active opportunities from Supabase for cross-batch comparison. */
async function fetchExistingRecords(): Promise<{ title: string; source_url: string }[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('opportunities')
      .select('title, source_url')
      .eq('status', 'active');

    if (error) {
      log.warn('DB query failed, skipping cross-batch dedup', { error: error.message });
      return [];
    }

    return (data ?? []) as { title: string; source_url: string }[];
  } catch (err) {
    log.warn('DB query crashed, skipping cross-batch dedup', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ── Phase 2: Cross-batch dedup ────────────────────────────────────────────────

/**
 * Check each item against:
 * 1. Existing DB records (hash + fuzzy)
 * 2. Batch items already confirmed unique (so near-duplicates within the batch are also caught)
 *
 * Items are processed sequentially. Confirmed-unique items are added to the pool,
 * so later items can match against them — this catches intra-batch fuzzy duplicates.
 */
function crossBatchDedup(
  intraUnique: ExtractedItem[],
  existingRecords: { title: string; source_url: string }[],
): { unique: ExtractedItem[]; duplicates: DuplicateMatch[] } {
  // Seed pool with existing DB records
  const pool: PoolRecord[] = existingRecords.map((r) =>
    toPoolRecord(r.title, r.source_url),
  );
  const unique: ExtractedItem[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const item of intraUnique) {
    const itemHash = generateHash(item.title, item.sourceUrl);
    const normalizedItemTitle = normalizeTitle(item.title);

    const hashMatch = checkHashAgainstPool(itemHash, pool);
    if (hashMatch) {
      log.info('Cross-batch hash duplicate', { title: item.title, matchedTitle: hashMatch });
      duplicates.push({ item, matchedTitle: hashMatch, matchType: 'hash', score: 100 });
      continue;
    }

    const fuzzyMatch = checkFuzzyAgainstPool(normalizedItemTitle, pool);
    if (fuzzyMatch) {
      log.info('Fuzzy duplicate', {
        newTitle: item.title,
        matchedTitle: fuzzyMatch.title,
        score: fuzzyMatch.score,
      });
      duplicates.push({ item, matchedTitle: fuzzyMatch.title, matchType: 'fuzzy', score: fuzzyMatch.score });
      continue;
    }

    // Confirmed unique — add to pool so subsequent items can match against it
    unique.push(item);
    pool.push({ title: item.title, normalizedTitle: normalizedItemTitle, hash: itemHash });
  }

  return { unique, duplicates };
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Deduplicate a batch of extracted items using hash (fast) + fuzzy (near-duplicates). */
export async function deduplicateBatch(
  items: ExtractedItem[],
): Promise<DeduplicationResult> {
  log.info('Starting deduplication', { total: items.length });

  const { unique: intraUnique, duplicates: intraDuplicates } = intraBatchHashDedup(items);

  // Phase 1b: URL-based cross-batch dedup
  const { unique: urlFiltered, duplicates: urlDupMatches } = await urlBasedDedup(intraUnique);
  log.info('URL dedup complete', { urlDuplicates: urlDupMatches.length });

  const existingRecords = await fetchExistingRecords();
  log.info('Loaded existing DB records for cross-batch comparison', {
    count: existingRecords.length,
  });

  const { unique, duplicates: crossDuplicates } = crossBatchDedup(urlFiltered, existingRecords);

  const allDuplicates = [...intraDuplicates, ...urlDupMatches, ...crossDuplicates];
  const stats = {
    total: items.length,
    uniqueCount: unique.length,
    hashDuplicates: allDuplicates.filter((d) => d.matchType === 'hash').length,
    urlDuplicates: allDuplicates.filter((d) => d.matchType === 'url').length,
    fuzzyDuplicates: allDuplicates.filter((d) => d.matchType === 'fuzzy').length,
  };

  log.info('Deduplication complete', stats);

  return { unique, duplicates: allDuplicates, stats };
}

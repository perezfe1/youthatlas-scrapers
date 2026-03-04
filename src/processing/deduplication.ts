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
  matchType: 'hash' | 'fuzzy';
  score: number; // 100 for hash matches, actual fuzzball score for fuzzy
};

export type DeduplicationResult = {
  unique: ExtractedItem[];
  duplicates: DuplicateMatch[];
  stats: {
    total: number;
    uniqueCount: number;
    hashDuplicates: number;
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

  const existingRecords = await fetchExistingRecords();
  log.info('Loaded existing DB records for cross-batch comparison', {
    count: existingRecords.length,
  });

  const { unique, duplicates: crossDuplicates } = crossBatchDedup(intraUnique, existingRecords);

  const allDuplicates = [...intraDuplicates, ...crossDuplicates];
  const stats = {
    total: items.length,
    uniqueCount: unique.length,
    hashDuplicates: allDuplicates.filter((d) => d.matchType === 'hash').length,
    fuzzyDuplicates: allDuplicates.filter((d) => d.matchType === 'fuzzy').length,
  };

  log.info('Deduplication complete', stats);

  return { unique, duplicates: allDuplicates, stats };
}

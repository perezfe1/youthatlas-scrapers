/**
 * Integration test for store.ts.
 *
 * Inserts 3 synthetic items, then re-upserts them to verify update detection.
 * Cleans up test rows (source_site = 'test-store') before and after the run.
 *
 * Usage: pnpm store:test
 */
import { loadBaseEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { storeBatch, flagOpportunity } from '@/processing/store.js';
import type { ExtractedItem } from '@/processing/deduplication.js';

const log = createLogger('store-test');

const TEST_SOURCE_SITE = 'test-store';

/** Shared fields for all test items (title + sourceUrl are injected per-item). */
const BASE: Omit<ExtractedItem, 'title' | 'sourceUrl'> = {
  description:
    'A prestigious test scholarship for youth leaders worldwide. This program provides funding and mentorship for emerging change-makers.',
  summary: 'Annual test scholarship supporting emerging leaders.',
  type: 'scholarship',
  fields: ['STEM', 'Social Sciences'],
  regions: ['global'],
  countries: [],
  target_audience: ['undergraduate'],
  eligibility_text: 'Open to students aged 18-25 from any country.',
  deadline: '2026-12-01',
  is_rolling: false,
  funding_amount: '$5,000',
  is_fully_funded: false,
  organization: 'Test Foundation',
  application_url: 'https://example.com/apply',
};

/** Remove all rows inserted during this test run. */
async function cleanup(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('opportunities')
    .delete()
    .eq('source_site', TEST_SOURCE_SITE);

  if (error) {
    log.warn('Cleanup failed', { error: error.message });
  } else {
    log.info('Cleanup complete — deleted test rows');
  }
}

async function main(): Promise<void> {
  loadBaseEnv();

  // Always start with a clean slate
  await cleanup();

  const items: ExtractedItem[] = [
    { ...BASE, title: 'Test Scholarship Alpha 2026', sourceUrl: 'https://example.com/alpha' },
    { ...BASE, title: 'Test Scholarship Beta 2026', sourceUrl: 'https://example.com/beta' },
    { ...BASE, title: 'Test Scholarship Gamma 2026', sourceUrl: 'https://example.com/gamma' },
  ];

  // ── Phase 1: insert ──────────────────────────────────────────────────────────
  log.info('Phase 1: inserting 3 new items');
  const insertResult = await storeBatch(items, TEST_SOURCE_SITE);
  log.info('Insert result', insertResult);

  if (
    insertResult.inserted !== 3 ||
    insertResult.updated !== 0 ||
    insertResult.failed !== 0
  ) {
    log.error('❌ Insert phase assertion failed', {
      expected: { inserted: 3, updated: 0, failed: 0 },
      actual: insertResult,
    });
    await cleanup();
    process.exit(1);
  }
  log.info('✅ Insert phase passed');

  // ── Phase 2: update (same source_urls → same slugs → upsert on slug) ─────────
  log.info('Phase 2: upserting same items again (expect all updates)');
  const updateResult = await storeBatch(items, TEST_SOURCE_SITE);
  log.info('Update result', updateResult);

  if (
    updateResult.updated !== 3 ||
    updateResult.inserted !== 0 ||
    updateResult.failed !== 0
  ) {
    log.error('❌ Update phase assertion failed', {
      expected: { updated: 3, inserted: 0, failed: 0 },
      actual: updateResult,
    });
    await cleanup();
    process.exit(1);
  }
  log.info('✅ Update phase passed');

  // ── Phase 3: flagOpportunity (best-effort, must not crash) ───────────────────
  log.info('Phase 3: testing flagOpportunity');
  await flagOpportunity(
    'https://example.com/flagged-test',
    'test_flag',
    'This is a test flag from store-test.ts',
  );
  log.info('✅ flagOpportunity did not crash');

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  await cleanup();
  log.info('✅ All store tests passed');
}

main().catch((err) => {
  log.error('Store test crashed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

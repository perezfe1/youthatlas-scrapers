import { loadBaseEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { deduplicateBatch, type ExtractedItem } from '@/processing/deduplication.js';

const log = createLogger('dedup-test');

/**
 * Shared base fields for all test items.
 * Only title and sourceUrl vary between items.
 */
const BASE: Omit<ExtractedItem, 'title' | 'sourceUrl'> = {
  description: 'A prestigious youth opportunity open to global applicants.',
  summary: 'Annual program supporting emerging leaders worldwide.',
  type: 'scholarship',
  fields: ['STEM', 'Social Sciences'],
  regions: ['global'],
  countries: [],
  target_audience: ['undergraduate', 'graduate'],
  eligibility_text: 'Open to students aged 18-30 from any country.',
  deadline: '2026-06-30',
  is_rolling: false,
  funding_amount: '$10,000',
  is_fully_funded: false,
  organization: 'Global Scholars Foundation',
  application_url: 'https://globalscholars.org/apply',
};

async function main(): Promise<void> {
  loadBaseEnv(); // needed for the Supabase cross-batch query

  // Item 1 — reference item (should survive as unique)
  const item1: ExtractedItem = {
    ...BASE,
    title: 'Global Scholars Program 2026',
    sourceUrl: 'https://globalscholars.org/program-2026',
  };

  // Item 2 — exact hash duplicate of item 1 (identical title + sourceUrl)
  // Expected: caught by intra-batch hash dedup
  const item2: ExtractedItem = {
    ...BASE,
    title: 'Global Scholars Program 2026',
    sourceUrl: 'https://globalscholars.org/program-2026',
  };

  // Item 3 — fuzzy duplicate of item 1 (same program, different year in title, different source)
  // After normalizeTitle strips years both become "global scholars program" → score 100
  // Expected: caught by cross-batch fuzzy dedup (item 1 is already in the pool as confirmed-unique)
  const item3: ExtractedItem = {
    ...BASE,
    title: 'Global Scholars Program 2027',
    sourceUrl: 'https://opportunitiesforstudents.com/global-scholars',
  };

  // Item 4 — completely unique
  const item4: ExtractedItem = {
    ...BASE,
    title: 'UN Youth Internship Programme 2026',
    sourceUrl: 'https://un.org/internships/youth-2026',
    organization: 'United Nations',
    type: 'internship',
  };

  // Item 5 — completely unique
  const item5: ExtractedItem = {
    ...BASE,
    title: 'Fulbright Foreign Student Program 2026',
    sourceUrl: 'https://fulbright.edu/foreign-student-2026',
    organization: 'Fulbright Commission',
    application_url: 'https://fulbright.edu/apply',
  };

  const items = [item1, item2, item3, item4, item5];
  log.info('Test input', { count: items.length, titles: items.map((i) => i.title) });

  const result = await deduplicateBatch(items);

  log.info('--- Results ---');
  log.info('Stats', result.stats);
  log.info('Unique', { titles: result.unique.map((i) => i.title) });
  log.info('Duplicates', {
    items: result.duplicates.map((d) => ({
      title: d.item.title,
      matchedTitle: d.matchedTitle,
      matchType: d.matchType,
      score: d.score,
    })),
  });

  // Assertions — Expected: 3 unique (items 1, 4, 5), 1 hash dup (item 2), 1 fuzzy dup (item 3)
  const expected = { uniqueCount: 3, hashDuplicates: 1, fuzzyDuplicates: 1 };
  const { stats } = result;

  const passed =
    stats.uniqueCount === expected.uniqueCount &&
    stats.hashDuplicates === expected.hashDuplicates &&
    stats.fuzzyDuplicates === expected.fuzzyDuplicates;

  if (passed) {
    log.info('✅ All assertions passed', { expected, actual: stats });
  } else {
    log.error('❌ Assertion failed', { expected, actual: stats });
    process.exit(1);
  }
}

main().catch((err) => {
  log.error('Dedup test crashed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

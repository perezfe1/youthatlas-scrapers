import { loadBaseEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { generateEmbedding } from '@/lib/openai.js';

const log = createLogger('backfill-embeddings');

// ── Types ─────────────────────────────────────────────────────────────────────

type BackfillRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info('Starting embedding backfill');

  // Validate env at startup (requires OPENAI_API_KEY + Supabase)
  loadBaseEnv();

  const supabase = getSupabaseClient();

  // ── Step 1: Query all active opportunities without embeddings ─────────────

  const { data, error } = await supabase
    .from('opportunities')
    .select('id, slug, title, summary, description')
    .eq('status', 'active')
    .is('embedding', null);

  if (error) {
    log.error('Failed to query opportunities for backfill', { error: error.message });
    process.exit(1);
  }

  const opps = (data ?? []) as BackfillRow[];
  log.info(`Found ${opps.length} opportunities to backfill`);

  if (opps.length === 0) {
    log.info('Nothing to backfill — all active opportunities already have embeddings');
    process.exit(0);
  }

  // ── Step 2: Generate and store embeddings ─────────────────────────────────

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < opps.length; i++) {
    const opp = opps[i]!;

    const embeddingText = `${opp.title}. ${opp.summary ?? opp.description ?? ''}`.slice(0, 8000);
    const embResult = await generateEmbedding(embeddingText);

    if (!embResult.data) {
      log.warn('Failed to generate embedding', {
        id: opp.id,
        slug: opp.slug,
        error: embResult.error.message,
      });
      failed++;
      await sleep(200);
      continue;
    }

    const { error: updateError } = await supabase
      .from('opportunities')
      .update({ embedding: JSON.stringify(embResult.data) })
      .eq('id', opp.id);

    if (updateError) {
      log.warn('Failed to update embedding in DB', {
        id: opp.id,
        slug: opp.slug,
        error: updateError.message,
      });
      failed++;
    } else {
      succeeded++;
    }

    // Log progress every 25 items
    if ((i + 1) % 25 === 0) {
      log.info(`Progress: ${i + 1}/${opps.length} (${succeeded} succeeded, ${failed} failed)`);
    }

    // 200ms delay between calls (OpenAI rate limit safety)
    await sleep(200);
  }

  log.info(`Backfill complete: ${succeeded} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error in backfill-embeddings:', err);
  process.exit(1);
});

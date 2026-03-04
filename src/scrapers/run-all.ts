/**
 * Legacy entry point — now delegates to the pipeline orchestrator.
 * The canonical entry point is src/pipeline/run.ts (pnpm pipeline).
 * This file is kept for backwards compatibility.
 */
import { loadExtractionEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { runPipeline } from '@/pipeline/orchestrator.js';

const log = createLogger('run-all');

async function main(): Promise<void> {
  loadExtractionEnv();
  log.info('run-all.ts → delegating to pipeline orchestrator');

  const result = await runPipeline();

  const allSuccess = result.results.every((r) => r.status === 'success');
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  log.error('run-all crashed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

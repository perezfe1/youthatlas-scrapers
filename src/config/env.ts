import { z } from 'zod';

// Base schema — only what's needed to connect to Supabase
const baseEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Extraction schema — Supabase + Anthropic (no Telegram needed)
const extractionEnvSchema = baseEnvSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
});

export type ExtractionEnv = z.infer<typeof extractionEnvSchema>;

/** Load and validate Supabase + Anthropic env vars. Use this in extraction modules. */
export function loadExtractionEnv(): ExtractionEnv {
  const result = extractionEnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Environment validation failed:\n${missing}\n`);
    console.error('Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  return result.data;
}

// Full schema — everything needed for the complete pipeline
const fullEnvSchema = baseEnvSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
  ADMIN_TELEGRAM_ID: z.string().min(1),
  // Optional — only required for distribution runs
  TELEGRAM_PUBLIC_CHANNEL_ID: z.string().min(1).optional(),
});

// Distribution schema — Supabase + public Telegram channel (no Anthropic needed)
const distributionEnvSchema = baseEnvSchema.extend({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_PUBLIC_CHANNEL_ID: z.string().min(1),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type FullEnv = z.infer<typeof fullEnvSchema>;
export type DistributionEnv = z.infer<typeof distributionEnvSchema>;

/** Load and validate Supabase-only env vars. Use this in scrapers and store modules. */
export function loadBaseEnv(): BaseEnv {
  const result = baseEnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Environment validation failed:\n${missing}\n`);
    console.error('Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  return result.data;
}

/** Load and validate distribution env vars. Use this in distribution entry points. */
export function loadDistributionEnv(): DistributionEnv {
  const result = distributionEnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Environment validation failed:\n${missing}\n`);
    console.error('Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  return result.data;
}

// Email digest schema — Supabase + Kit (no Anthropic, no Telegram required)
const emailEnvSchema = baseEnvSchema.extend({
  KIT_API_SECRET: z.string().min(1),
});

export type EmailEnv = z.infer<typeof emailEnvSchema>;

/** Load and validate env vars needed for the weekly email digest. */
export function loadEmailEnv(): EmailEnv {
  const result = emailEnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Environment validation failed:\n${missing}\n`);
    console.error('Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  return result.data;
}

/** Load and validate ALL env vars. Use this in orchestrator and distribution modules. */
export function loadEnv(): FullEnv {
  const result = fullEnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Environment validation failed:\n${missing}\n`);
    console.error('Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  return result.data;
}

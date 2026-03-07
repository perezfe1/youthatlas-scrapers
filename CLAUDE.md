# YouthAtlas Scrapers — Claude Code Context

## What This Is

Automated pipeline that scrapes opportunity listings from 15+ websites, processes them with Claude AI, stores in Supabase, and distributes to Telegram + email. Runs daily via GitHub Actions.

## Project Status

### Phase 1 — Scraper Pipeline (COMPLETE)
All 9 modules done:
- 5 scrapers: YouthOp, OFY (OpportunityForYouth), OpDesk, AfterSchool, ScholAds
- AI extraction via Claude Haiku (Zod-validated output)
- Supabase storage with dedup (insert + 23505 silent skip)
- Daily automated pipeline via GitHub Actions (`ingest.yml`)
- Telegram health monitoring (scrape_runs + flagged_listings logging)

### Phase 3 — Distribution (COMPLETE)
| Feature | Details |
|---------|---------|
| Telegram auto-posting | `distribute-telegram.yml` triggers after each ingest; posts to @youthatlas1 |
| Weekly email digest | `weekly-digest.yml` runs Monday 8 AM UTC; Kit v3 broadcast (draft — publish in Kit dashboard) |

## Tech Stack

- Node.js / TypeScript (strict) / ESM modules
- Crawlee (scraping framework)
- Claude API via `@anthropic-ai/sdk` — model: `claude-haiku-4-5-20251001`
- Supabase (shared DB with the platform)
- Kit (ConvertKit) — email newsletter (API v3 for broadcasts, API v4 for subscriber listing)
- GitHub Actions (cron scheduling)

## GitHub Actions Workflows

| File | Workflow Name | Schedule / Trigger | Purpose |
|------|-----------|---------|---------|
| `ingest.yml` | "Daily Ingest Pipeline" | Daily 4 AM UTC | Scrape → extract → store (3 jobs) |
| `distribute-telegram.yml` | "Telegram Distribution" | On completion of "Daily Ingest Pipeline" | Post new listings to @youthatlas1 |
| `weekly-digest.yml` | "Weekly Email Digest" | Monday 8 AM UTC | Send Kit v3 broadcast draft |

## Package Scripts

| Script | Env | Purpose |
|--------|-----|---------|
| `pipeline` / `pipeline:ci` | .env / CI | Full scrape + extract + store |
| `pipeline:dry` | .env | Dry-run with limit=3 |
| `scrape:youthop` … `scrape:scholads` | .env | Run individual scraper |
| `distribute:telegram` | .env | Post new opps to Telegram (local) |
| `distribute:telegram:ci` | CI | Post new opps to Telegram (CI) |
| `digest:email` | .env | Send weekly email digest (local) |
| `digest:email:ci` | CI | Send weekly email digest (CI) |
| `type-check` | — | `tsc --noEmit` |

## Environment Variables

### All workflows
| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses RLS) |
| `TELEGRAM_BOT_TOKEN` | Bot token for admin/monitoring messages |
| `TELEGRAM_CHANNEL_ID` | Admin monitoring channel (health reports) |

### distribute-telegram.yml only
| Var | Purpose |
|-----|---------|
| `TELEGRAM_PUBLIC_CHANNEL_ID` | Public channel @youthatlas1 (opportunity posts) |

### weekly-digest.yml only
| Var | Purpose |
|-----|---------|
| `KIT_API_SECRET` | Kit/ConvertKit API secret (v3 + v4 calls) |

### Ingest pipeline only
| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Claude Haiku for AI extraction |

> ⚠️ `TELEGRAM_CHANNEL_ID` (admin) ≠ `TELEGRAM_PUBLIC_CHANNEL_ID` (public). Using the wrong one silently fails.
> ⚠️ Kit broadcasts are drafts — `POST /v3/broadcasts` creates a draft only. Must be published in the Kit dashboard.

## Architecture Rules — FOLLOW THESE ALWAYS

1. **Every async function returns `Result<T>`** (see `src/types/opportunity.ts`). Never throw.
2. **Env vars validated via Zod** in `src/config/env.ts`. Never use raw `process.env`. Call the appropriate `load*Env()` at the top of every entry point.
3. **All scrapers extend the base scraper pattern** in `src/scrapers/base-scraper.ts`. Includes retry logic, rate limiting, and run logging.
4. **Claude API output is ALWAYS validated with Zod** before storing. Never trust raw LLM output.
5. **Scraping and distribution are decoupled.** Separate GitHub Actions workflows. If distribution fails, scraping still succeeds.
6. **One scraper per file.** One processing concern per file. One distribution channel per file.
7. **Record every pipeline run** in the `scrape_runs` table. Log failures to `flagged_listings`.
8. **Dedup via insert + 23505.** Use `insert` (not `upsert`) on `distribution_log`; silently skip on unique constraint violations.

## No-Touch Files

- `src/config/env.ts`
- `src/types/opportunity.ts` (shared contract — changes must be mirrored in platform repo)

## Key Files

| File | Purpose |
|------|---------|
| `src/types/opportunity.ts` | `Opportunity` interface + all enum types (shared with platform repo) |
| `src/config/env.ts` | Zod env validation — `loadEnv()`, `loadEmailEnv()` |
| `src/config/constants.ts` | All magic numbers: rate limits, thresholds, model name, `EMAIL_DIGEST` settings |
| `src/pipeline/run.ts` | CLI entry point for full scrape + extract + store pipeline |
| `src/scrapers/base-scraper.ts` | Base class with retry, rate limiting, run logging |
| `src/processing/extract.ts` | Claude Haiku extraction + Zod validation |
| `src/processing/store.ts` | Supabase upsert with dedup |
| `src/distribution/run-telegram.ts` | CLI entry: post new opps to Telegram |
| `src/distribution/telegram-distributor.ts` | Core logic: query unsent opps, post, record in `distribution_log` |
| `src/distribution/run-email-digest.ts` | CLI entry: query opps → format → send Kit broadcast → record log |
| `src/distribution/kit-client.ts` | Kit API: `getSubscribers()` (v4) + `sendBroadcast()` (v3) |
| `src/distribution/email-formatter.ts` | Table-based HTML email builder (inline styles, `{{ unsubscribe_url }}`) |
| `src/lib/telegram.ts` | `sendTelegramMessage()` helper |
| `src/lib/supabase.ts` | Supabase client singleton |
| `src/lib/logger.ts` | Structured JSON logger |

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `opportunities` | Main listings (status: active/expired/flagged) |
| `scrape_runs` | One row per pipeline run (source, counts, errors) |
| `distribution_log` | Tracks what was sent where (`channel`: `telegram` or `email_digest`) |
| `flagged_listings` | Raw listings that failed AI extraction or validation |

## Key Constants

All magic numbers live in `src/config/constants.ts`. Rate limits, thresholds, model names — everything. Includes `EMAIL_DIGEST` section with `MAX_OPPORTUNITIES`, `LOOKBACK_DAYS`, `MAX_SUMMARY_LENGTH`.

## Shared Types

`src/types/opportunity.ts` is identical to the platform repo's copy. If you change it here, note that it must be mirrored there.

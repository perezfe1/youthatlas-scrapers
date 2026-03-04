# YouthAtlas Scrapers — Claude Code Context

## What This Is

Automated pipeline that scrapes opportunity listings from 15+ websites, processes them with Claude AI, stores in Supabase, and distributes to Telegram + email. Runs daily via GitHub Actions.

## Tech Stack

- Node.js / TypeScript (strict) / ESM modules
- Crawlee (scraping framework)
- Claude API via @anthropic-ai/sdk (Haiku 4.5 for extraction)
- Supabase (shared DB with the platform)
- GitHub Actions (cron scheduling)

## Architecture Rules — FOLLOW THESE ALWAYS

1. **Every async function returns `Result<T>`** (see `src/types/opportunity.ts`). Never throw.
2. **Env vars validated via Zod** in `src/config/env.ts`. Never use raw `process.env`. Call `loadEnv()` at the top of every entry point.
3. **All scrapers extend the base scraper pattern** in `src/scrapers/base-scraper.ts` (when created). Includes retry logic, rate limiting, and run logging.
4. **Claude API output is ALWAYS validated with Zod** before storing. Never trust raw LLM output.
5. **Scraping and distribution are decoupled.** Separate GitHub Actions workflows. If distribution fails, scraping still succeeds.
6. **One scraper per file.** One processing concern per file. One distribution channel per file.
7. **Record every pipeline run** in the `scrape_runs` table. Log failures to `flagged_listings`.

## No-Touch Files

- `src/config/env.ts`
- `src/types/opportunity.ts` (shared contract — changes must be mirrored in platform repo)

## GitHub Actions Workflows

- `ingest.yml` — daily 4 AM UTC: scrape → process → store (3 separate jobs)
- `distribute.yml` — daily 6 AM UTC: post new listings to Telegram
- `weekly-digest.yml` — Sundays 10 AM UTC: email newsletter

## Key Constants

All magic numbers live in `src/config/constants.ts`. Rate limits, thresholds, model names — everything.

## Shared Types

`src/types/opportunity.ts` is identical to the platform repo's copy. If you change it here, note that it must be mirrored there.

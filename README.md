# youthatlas-scrapers

The automated data pipeline for **YouthAtlas**. Scrapes opportunity sources, processes them with Claude AI, stores structured data in Supabase, and distributes daily digests via Telegram and email.

## What It Does

1. **Ingest** — Crawlee + Playwright scrapers fetch raw opportunity listings from configured sources.
2. **Process** — Claude (Anthropic SDK) extracts structured fields (title, deadline, amount, eligibility, URL) from raw HTML.
3. **Store** — Deduplicated records are written to Supabase via the service-role key.
4. **Distribute** — Formatted digests are pushed to a Telegram channel and an email list.

## GitHub Actions Workflows

| Workflow            | Schedule                 | Description                          |
|---------------------|--------------------------|--------------------------------------|
| `ingest-daily`      | Daily at 4:00 AM UTC     | Runs all scrapers + AI extraction    |
| `distribute-daily`  | Daily at 6:00 AM UTC     | Posts new opportunities to Telegram  |
| `weekly-digest`     | Sundays at 10:00 AM UTC  | Sends weekly email digest            |

## Project Structure

```
src/
├── scrapers/      # One file per source site
├── processing/    # AI extraction (extract.ts) and Supabase writes (store.ts)
├── distribution/  # Telegram (telegram-post.ts) and email (email-digest.ts)
├── monitoring/    # Health checks and error alerting
├── types/         # Shared TypeScript types
└── config/        # Env validation and constants
output/            # Temporary scrape output (git-ignored)
```

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Install Playwright browsers (first time only)
pnpm exec playwright install chromium

# 3. Copy environment variables and fill in your values
cp .env.example .env

# 4. Verify setup
pnpm scrape
```

## Available Scripts

| Command                      | Description                            |
|------------------------------|----------------------------------------|
| `pnpm scrape`                | Run all scrapers                       |
| `pnpm process`               | Run AI extraction on raw output        |
| `pnpm store`                 | Write processed records to Supabase    |
| `pnpm distribute:telegram`   | Post digest to Telegram channel        |
| `pnpm distribute:email`      | Send weekly email digest               |
| `pnpm type-check`            | Run TypeScript type checking           |
| `pnpm build`                 | Compile TypeScript to dist/            |

## Adding a New Scraper

1. Create `src/scrapers/<source-name>.ts`.
2. Export a default `async function scrape(): Promise<RawOpportunity[]>`.
3. Import and call it in `src/scrapers/run-all.ts`.

Each scraper file has a single responsibility: fetch raw listings from one source. All AI processing belongs in `src/processing/extract.ts`.

## Related

- **Web platform**: [youthatlas-platform](https://github.com/perezfe1/youthatlas-platform)

# YouthAtlas Scrapers — Claude Code Context

## What This Is

Automated pipeline that scrapes opportunity listings from trusted aggregator websites, processes them with Google Gemini AI, stores in Supabase, and distributes to Telegram + email. Runs daily via GitHub Actions.

## Project Status

### Phase 1 — Scraper Pipeline (COMPLETE)
All 9 modules done:
- 5 scrapers: YouthOp, OFY (OpportunityForYouth), OpDesk, AfterSchool, ScholAds
- AI extraction via Google Gemini 2.5 Flash (Zod-validated output)
- Supabase storage with dedup (SHA-256 hash → URL dedup → fuzzball fuzzy match, threshold 78)
- Daily automated pipeline via GitHub Actions (`ingest.yml`, parallel matrix strategy)
- Telegram health monitoring (scrape_runs + flagged_listings logging)
- 800+ opportunities indexed

### Phase 3 — Distribution (COMPLETE)
| Feature | Details |
|---------|---------|
| Telegram auto-posting | `distribute-telegram.yml` triggers after each ingest; posts to @youthatlas1 |
| Weekly email digest | `weekly-digest.yml` runs Monday 8 AM UTC; Kit v3 broadcast (draft — publish in Kit dashboard) |
| Deadline reminders | `deadline-reminders.yml` runs daily 10 AM UTC; Resend transactional email |
| Personalized digest | `personalized-digest.yml` runs Monday 8 AM UTC; individual Resend email per user with matching opps |
| Web push notifications | `push-notifications.yml` triggers after ingest; web-push to all `push_subscriptions` subscribers |

## Tech Stack

- Node.js / TypeScript (strict) / ESM modules
- Crawlee (scraping framework)
- Google Gemini via `@google/generative-ai` — model: `gemini-2.5-flash` (extraction)
- OpenAI via `openai` — model: `text-embedding-3-small` (embeddings only, 1536 dimensions)
- Resend — transactional email (deadline reminders)
- Supabase (shared DB with the platform)
- Kit (ConvertKit) — email newsletter (API v3 for broadcasts, API v4 for subscriber listing)
- GitHub Actions (cron scheduling, parallel matrix strategy)

## GitHub Actions Workflows

| File | Workflow Name | Schedule / Trigger | Purpose |
|------|-----------|---------|---------|
| `ingest.yml` | "Daily Ingest Pipeline" | Daily 4 AM UTC | Scrape → extract → store (parallel matrix, 5 scrapers) |
| `distribute-telegram.yml` | "Telegram Distribution" | On completion of "Daily Ingest Pipeline" | Post new listings to @youthatlas1 |
| `weekly-digest.yml` | "Weekly Email Digest" | Monday 8 AM UTC | Send Kit v3 broadcast draft |
| `deadline-reminders.yml` | "Deadline Reminders" | Daily 10 AM UTC | Email users with upcoming deadlines |
| `personalized-digest.yml` | "Personalized Weekly Digest" | Monday 8 AM UTC | Per-user Resend email based on type/region prefs |
| `push-notifications.yml` | "Push Notifications" | On completion of "Daily Ingest Pipeline" | Web Push to all push_subscriptions subscribers |
| `type-check.yml` | "Type Check" | On push/PR | TypeScript validation |

## Package Scripts

| Script | Env | Purpose |
|--------|-----|---------|
| `pipeline` / `pipeline:ci` | .env / CI | Full scrape + extract + store |
| `pipeline:dry` | .env | Dry-run with limit=3 |
| `scrape:youthop` ... `scrape:scholads` | .env | Run individual scraper |
| `distribute:telegram` / `distribute:telegram:ci` | .env / CI | Post new opps to Telegram |
| `digest:email` / `digest:email:ci` | .env / CI | Send weekly email digest |
| `reminders` / `reminders:ci` | .env / CI | Send deadline reminder emails |
| `digest:personalized` / `digest:personalized:ci` | .env / CI | Send personalized weekly email digest |
| `push` / `push:ci` | .env / CI | Send web push notifications |
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
| `GOOGLE_AI_API_KEY` | Google Gemini for AI extraction (`gemini-2.5-flash`) |
| `OPENAI_API_KEY` | OpenAI for embeddings (`text-embedding-3-small`) |

### Deadline reminders only
| Var | Purpose |
|-----|---------|
| `RESEND_API_KEY` | Resend transactional email |

### Personalized digest only
| Var | Purpose |
|-----|---------|
| `RESEND_API_KEY` | Resend transactional email |
| `TELEGRAM_BOT_TOKEN` | Admin monitoring |
| `TELEGRAM_CHANNEL_ID` | Admin monitoring channel |

### Push notifications only
| Var | Purpose |
|-----|---------|
| `VAPID_PUBLIC_KEY` | VAPID public key (prime256v1 ECDH) |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `TELEGRAM_BOT_TOKEN` | Admin notification on send |
| `TELEGRAM_CHANNEL_ID` | Admin monitoring channel |

> ⚠️ `TELEGRAM_CHANNEL_ID` (admin) ≠ `TELEGRAM_PUBLIC_CHANNEL_ID` (public). Using the wrong one silently fails.
> ⚠️ Kit broadcasts are drafts — `POST /v3/broadcasts` creates a draft only. Must be published in the Kit dashboard.
> ⚠️ GitHub Secrets: always set via `gh secret set` piped from .env to avoid trailing whitespace corruption.

## Architecture Rules — FOLLOW THESE ALWAYS

1. **Every async function returns `Result<T>`** (see `src/types/opportunity.ts`). Never throw.
2. **Env vars validated via Zod** in `src/config/env.ts`. Never use raw `process.env`. Call the appropriate `load*Env()` at the top of every entry point.
3. **All scrapers extend the base scraper pattern** in `src/scrapers/base-scraper.ts`. Includes retry logic, rate limiting, and run logging.
4. **AI model output is ALWAYS validated with Zod** before storing. Never trust raw LLM output.
5. **Scraping and distribution are decoupled.** Separate GitHub Actions workflows. If distribution fails, scraping still succeeds.
6. **One scraper per file.** One processing concern per file. One distribution channel per file.
7. **Record every pipeline run** in the `scrape_runs` table. Log failures to `flagged_listings`.
8. **Dedup via insert + 23505.** Use `insert` (not `upsert`) on `distribution_log`; silently skip on unique constraint violations.
9. **Never select('*') on opportunities table.** Always use explicit column lists. The `embedding` column is 6KB/row and kills egress. The `fts` column is not selectable via PostgREST.
10. **Distribution dedup in JS, not SQL.** Use a Set for already-posted IDs instead of SQL NOT IN clauses — large UUID lists exceed HTTP URL length limits on GitHub Actions.

## No-Touch Files

- `src/config/env.ts`
- `src/types/opportunity.ts` (shared contract — changes must be mirrored in platform repo)
- `src/lib/gemini-client.ts` (Gemini singleton — do not modify without updating extraction flow)

## Key Files

| File | Purpose |
|------|---------|
| `src/types/opportunity.ts` | `Opportunity` interface + all enum types (shared with platform repo) |
| `src/config/env.ts` | Zod env validation — `loadExtractionEnv()`, `loadBaseEnv()`, `loadDistributionEnv()`, `loadEmailEnv()`, `loadRemindersEnv()`, `loadPersonalizedDigestEnv()`, `loadPushEnv()`, `loadEnv()` |
| `src/config/constants.ts` | All magic numbers: rate limits, thresholds, model name, `EMAIL_DIGEST` settings |
| `src/pipeline/run.ts` | CLI entry point for full scrape + extract + store pipeline |
| `src/scrapers/base-scraper.ts` | Base class with retry, rate limiting, run logging |
| `src/processing/extractor.ts` | Gemini 2.5 Flash extraction + Zod validation |
| `src/lib/gemini-client.ts` | Gemini client singleton (`getGeminiClient()`) |
| `src/processing/store.ts` | Supabase upsert with dedup |
| `src/distribution/run-telegram.ts` | CLI entry: post new opps to Telegram |
| `src/distribution/telegram-distributor.ts` | Core logic: query unsent opps (explicit columns, JS-side dedup), post, record in `distribution_log` |
| `src/distribution/run-email-digest.ts` | CLI entry: query opps (explicit columns) → format → send Kit broadcast → record log |
| `src/distribution/kit-client.ts` | Kit API: `getSubscribers()` (v4) + `sendBroadcast()` (v3) |
| `src/distribution/email-formatter.ts` | Table-based HTML email builder (inline styles, `{{ unsubscribe_url }}`) |
| `src/reminders/run-reminders.ts` | CLI entry: send deadline reminder emails via Resend |
| `src/reminders/query.ts` | getUsersWithUpcomingDeadlines(daysAhead) |
| `src/reminders/sender.ts` | sendReminderEmails() via Resend |
| `src/reminders/email-template.ts` | formatReminderEmail() — inline-style HTML |
| `src/distribution/personalized/types.ts` | DigestUser, PersonalizedDigestResult types |
| `src/distribution/personalized/query.ts` | getUsersForDigest() (user_profiles + Auth admin API), getDigestOpportunities() |
| `src/distribution/personalized/matcher.ts` | matchOpportunitiesForUser() — OR logic on type/region prefs |
| `src/distribution/personalized/email-template.ts` | formatPersonalizedDigest() — inline HTML, type badges |
| `src/distribution/personalized/sender.ts` | sendPersonalizedDigests() via Resend, 1s rate limit |
| `src/distribution/personalized/run-personalized-digest.ts` | CLI entry for personalized digest |
| `src/distribution/push/types.ts` | PushSubscription, PushPayload, PushResult types |
| `src/distribution/push/sender.ts` | getAllPushSubscriptions(), sendPushNotifications() — auto-removes 410 expired |
| `src/distribution/push/run-push.ts` | CLI entry: queries last 24h opps, builds payload, sends push, Telegram admin notify |
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
| `reminder_preferences` | User opt-out for deadline reminder emails |
| `push_subscriptions` | Web Push subscriptions (endpoint, p256dh, auth, user_id nullable) |

## Key Constants

All magic numbers live in `src/config/constants.ts`. Rate limits, thresholds, model names — everything. Includes `EMAIL_DIGEST` section with `MAX_OPPORTUNITIES`, `LOOKBACK_DAYS`, `MAX_SUMMARY_LENGTH`.

## Shared Types

`src/types/opportunity.ts` is identical to the platform repo's copy. If you change it here, note that it must be mirrored there.

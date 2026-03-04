export const SCRAPING = {
  /** Minimum seconds between requests to the same site */
  RATE_LIMIT_SECONDS: 3,
  /** Max retries on transient errors (429, 503) */
  MAX_RETRIES: 2,
  /** Max pages to scrape per source per run */
  MAX_PAGES_PER_SOURCE: 50,
} as const;

export const DEDUPLICATION = {
  /** Fuzzy match threshold (0-100). Above this = duplicate. */
  FUZZY_THRESHOLD: 85,
} as const;

export const TELEGRAM = {
  /** Max messages per minute to a channel */
  MESSAGES_PER_MINUTE: 15,
  /** Delay between posts in milliseconds */
  POST_DELAY_MS: 4000,
  /** Max message length */
  MAX_MESSAGE_LENGTH: 4096,
} as const;

export const PROCESSING = {
  /** Claude model for extraction */
  MODEL: 'claude-haiku-4-5-20250929' as const,
  /** Max tokens for extraction response */
  MAX_TOKENS: 2048,
} as const;

import Anthropic from '@anthropic-ai/sdk';
import { PROCESSING } from '@/config/constants.js';
import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '@/processing/extraction-prompt.js';
import { extractedOpportunitySchema, type ValidatedExtraction } from '@/processing/extraction-schema.js';
import type { Result } from '@/types/opportunity.js';
import type { ScrapedPage } from '@/types/scraper.js';

const log = createLogger('extractor');

/** Result of processing a single page. */
export interface ExtractionResult {
  sourceUrl: string;
  extraction: ValidatedExtraction | null;
  error: string | null;
}

/** Summary of a batch extraction run. */
export interface ExtractionSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: ExtractionResult[];
}

/**
 * Initialize the Anthropic client.
 * Reads ANTHROPIC_API_KEY from environment.
 * We don't use loadEnv() here because the extractor only needs
 * ANTHROPIC_API_KEY + Supabase vars (for flagging).
 */
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment');
  }
  return new Anthropic({ apiKey });
}

/**
 * Extract structured data from a single scraped page using Claude.
 * Returns the validated extraction or null with an error message.
 */
async function extractSinglePage(
  client: Anthropic,
  page: ScrapedPage,
): Promise<ExtractionResult> {
  const { sourceUrl, title, rawHtml } = page;

  try {
    // 1. Call Claude API
    log.debug('Calling Claude API', { sourceUrl, model: PROCESSING.MODEL });

    const response = await client.messages.create({
      model: PROCESSING.MODEL,
      max_tokens: PROCESSING.MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(title, sourceUrl, rawHtml),
        },
      ],
    });

    // 2. Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return {
        sourceUrl,
        extraction: null,
        error: 'Claude returned no text content',
      };
    }

    const rawText = textBlock.text.trim();

    // 3. Parse JSON — handle markdown fences if Claude adds them despite instructions
    let jsonText = rawText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      return {
        sourceUrl,
        extraction: null,
        error: `JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Raw: ${rawText.slice(0, 200)}`,
      };
    }

    // 4. Validate with Zod
    const validated = extractedOpportunitySchema.safeParse(parsed);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return {
        sourceUrl,
        extraction: null,
        error: `Zod validation failed: ${issues}`,
      };
    }

    // 5. Log token usage
    log.debug('Extraction succeeded', {
      sourceUrl,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return {
      sourceUrl,
      extraction: validated.data,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Handle specific API errors
    if (err instanceof Anthropic.APIError) {
      return {
        sourceUrl,
        extraction: null,
        error: `Claude API error (${err.status}): ${err.message}`,
      };
    }

    return {
      sourceUrl,
      extraction: null,
      error: `Extraction crashed: ${message}`,
    };
  }
}

/**
 * Flag a failed extraction in the flagged_listings table.
 * This is best-effort — if flagging itself fails, we just log it.
 */
async function flagFailedExtraction(
  sourceUrl: string,
  errorMessage: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('flagged_listings').insert({
      flag_reason: 'extraction_failed',
      details: `URL: ${sourceUrl}\nError: ${errorMessage}`,
      auto_flagged: true,
      reviewed: false,
    });

    if (error) {
      log.warn('Failed to insert flagged listing', {
        sourceUrl,
        dbError: error.message,
      });
    }
  } catch (err) {
    log.warn('Failed to flag extraction error', {
      sourceUrl,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Extract structured data from a batch of scraped pages.
 * Processes pages sequentially to respect API rate limits.
 * Failed pages are flagged but don't stop the batch.
 */
export async function extractPages(
  pages: ScrapedPage[],
): Promise<Result<ExtractionSummary>> {
  if (pages.length === 0) {
    return {
      data: { total: 0, succeeded: 0, failed: 0, results: [] },
      error: null,
    };
  }

  try {
    const client = getAnthropicClient();
    const results: ExtractionResult[] = [];
    let succeeded = 0;
    let failed = 0;

    log.info('Starting extraction batch', { totalPages: pages.length });

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      log.info(`Processing page ${i + 1}/${pages.length}`, {
        title: page.title,
        sourceUrl: page.sourceUrl,
      });

      const result = await extractSinglePage(client, page);
      results.push(result);

      if (result.extraction) {
        succeeded++;
      } else {
        failed++;
        log.warn('Extraction failed for page', {
          sourceUrl: result.sourceUrl,
          error: result.error,
        });
        // Flag for human review — best effort
        await flagFailedExtraction(result.sourceUrl, result.error ?? 'Unknown error');
      }

      // Brief pause between API calls to be respectful
      // The Anthropic SDK handles rate limiting automatically,
      // but a small delay smooths out request patterns
      if (i < pages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    log.info('Extraction batch complete', { total: pages.length, succeeded, failed });

    return {
      data: { total: pages.length, succeeded, failed, results },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      error: { code: 'EXTRACTION_BATCH_FAILED', message },
    };
  }
}

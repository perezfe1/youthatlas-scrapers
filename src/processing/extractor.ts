import OpenAI from 'openai';

import { PROCESSING } from '@/config/constants.js';
import { createLogger } from '@/lib/logger.js';
import { getOpenAIClient } from '@/lib/openai-client.js';
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
 * Extract structured data from a single scraped page using GPT-4o-mini.
 * Returns the validated extraction or null with an error message.
 */
async function extractSinglePage(
  client: OpenAI,
  page: ScrapedPage,
): Promise<ExtractionResult> {
  const { sourceUrl, title, rawHtml } = page;

  try {
    // 1. Call OpenAI API
    log.debug('Calling OpenAI API', { sourceUrl, model: PROCESSING.MODEL });

    const response = await client.chat.completions.create({
      model: PROCESSING.MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(title, sourceUrl, rawHtml) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: PROCESSING.MAX_TOKENS,
    });

    // 2. Extract text from response
    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return {
        sourceUrl,
        extraction: null,
        error: 'OpenAI returned no content',
      };
    }

    const rawText = raw.trim();

    // 3. Parse JSON — response_format: json_object should guarantee valid JSON,
    //    but we handle fences defensively just in case
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
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    });

    return {
      sourceUrl,
      extraction: validated.data,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Handle specific OpenAI API errors
    if (err instanceof OpenAI.APIError) {
      return {
        sourceUrl,
        extraction: null,
        error: `OpenAI API error (${err.status}): ${err.message}`,
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
    const client = getOpenAIClient();
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

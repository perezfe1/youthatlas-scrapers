import OpenAI from 'openai';

import { createLogger } from '@/lib/logger.js';
import type { Result } from '@/types/opportunity.js';

const log = createLogger('openai');

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_INPUT_CHARS = 8000;

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  client = new OpenAI({ apiKey });
  return client;
}

/**
 * Generate a 1536-dimensional embedding for the given text using
 * text-embedding-3-small. Input is truncated to MAX_INPUT_CHARS before sending.
 * Returns Result<number[]> — never throws.
 */
export async function generateEmbedding(text: string): Promise<Result<number[]>> {
  try {
    const truncated = text.slice(0, MAX_INPUT_CHARS);
    const openai = getOpenAIClient();

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncated,
    });

    return { data: response.data[0]!.embedding, error: null };
  } catch (err) {
    log.warn('Embedding generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      data: null,
      error: {
        code: 'OPENAI_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

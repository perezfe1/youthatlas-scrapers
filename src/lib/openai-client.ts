import OpenAI from 'openai';

let client: OpenAI | null = null;

/** Get a singleton OpenAI client. Reads OPENAI_API_KEY from process.env. */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

import { GoogleGenerativeAI } from '@google/generative-ai';

let client: GoogleGenerativeAI | null = null;

/** Get a singleton Google Gemini client. Reads GOOGLE_AI_API_KEY from process.env. */
export function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not set in environment');
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

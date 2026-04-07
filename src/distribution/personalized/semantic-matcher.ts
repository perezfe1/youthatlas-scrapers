import type { Opportunity } from '@/types/opportunity.js';

const SEMANTIC_LIMIT = 15;
const SIMILARITY_THRESHOLD = 0.45; // min cosine similarity to include

// ── Math utilities ────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length vectors.
 * Returns a value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute the centroid (element-wise average) of multiple vectors.
 * Returns null if the input is empty.
 */
export function averageVectors(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0]!.length;
  const result = new Array<number>(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      result[i]! += vec[i]!;
    }
  }
  for (let i = 0; i < dim; i++) {
    result[i]! /= vectors.length;
  }
  return result;
}

// ── Semantic matching ─────────────────────────────────────────────────────────

/**
 * Rank a pool of opportunities by cosine similarity to a user vector.
 * Returns opportunities sorted by relevance (most similar first),
 * filtered to those above SIMILARITY_THRESHOLD.
 */
export function semanticRankOpportunities(
  userVector: number[],
  pool: Opportunity[],
  poolEmbeddings: Map<string, number[]>,
  limit: number = SEMANTIC_LIMIT,
): Opportunity[] {
  const scored: Array<{ opp: Opportunity; score: number }> = [];

  for (const opp of pool) {
    const embedding = poolEmbeddings.get(opp.id);
    if (!embedding) continue;
    const score = cosineSimilarity(userVector, embedding);
    if (score >= SIMILARITY_THRESHOLD) {
      scored.push({ opp, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.opp);
}

/**
 * Blend keyword matches with semantic matches.
 *
 * Strategy:
 * - Keyword matches always come first (they are explicitly relevant)
 * - Semantic matches supplement up to the limit, deduped by id
 * - The result is marked as personalized if either source found matches
 */
export function blendMatches(
  keywordMatches: Opportunity[],
  semanticMatches: Opportunity[],
  limit: number = SEMANTIC_LIMIT,
): { opportunities: Opportunity[]; isPersonalized: boolean; hasSemantic: boolean } {
  const seen = new Set<string>(keywordMatches.map(o => o.id));
  const supplements: Opportunity[] = [];

  for (const opp of semanticMatches) {
    if (seen.has(opp.id)) continue;
    supplements.push(opp);
    seen.add(opp.id);
    if (keywordMatches.length + supplements.length >= limit) break;
  }

  const blended = [...keywordMatches, ...supplements].slice(0, limit);
  return {
    opportunities: blended,
    isPersonalized: blended.length > 0,
    hasSemantic: supplements.length > 0,
  };
}

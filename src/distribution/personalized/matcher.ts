import type { Opportunity } from '@/types/opportunity.js';
import type { DigestUser } from './types.js';

const GENERIC_LIMIT = 10;
const PERSONALIZED_LIMIT = 15;

/**
 * Filter opportunities for a specific user based on their preferences.
 *
 * - If the user has NO preferences, returns the top N by completeness_score (generic).
 * - If the user HAS preferences, filters by type OR region (inclusive OR).
 * - If preferences exist but yield NO matches, falls back to generic top N.
 *
 * Returns { opportunities, isPersonalized }.
 */
export function matchOpportunitiesForUser(
  user: DigestUser,
  opportunities: Opportunity[],
): { opportunities: Opportunity[]; isPersonalized: boolean } {
  const hasTypes = user.types_of_interest.length > 0;
  const hasRegions = user.regions_of_interest.length > 0;

  // No preferences → generic digest
  if (!hasTypes && !hasRegions) {
    return {
      opportunities: opportunities.slice(0, GENERIC_LIMIT),
      isPersonalized: false,
    };
  }

  // Build preference sets for O(1) lookups
  const typeSet = new Set(user.types_of_interest);
  const regionSet = new Set(user.regions_of_interest);

  const matched = opportunities.filter((opp) => {
    // Match type (if user has type preferences)
    if (hasTypes && typeSet.has(opp.type)) return true;

    // Match region (if user has region preferences)
    if (hasRegions && opp.regions.some((r) => regionSet.has(r))) return true;

    return false;
  });

  // If preferences yielded no matches, fall back to generic
  if (matched.length === 0) {
    return {
      opportunities: opportunities.slice(0, GENERIC_LIMIT),
      isPersonalized: false,
    };
  }

  return {
    opportunities: matched.slice(0, PERSONALIZED_LIMIT),
    isPersonalized: true,
  };
}

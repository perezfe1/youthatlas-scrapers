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

  const citizenship = user.country_of_citizenship ?? null;
  const citizenship2 = user.country_of_citizenship_2 ?? null;

  // ── Citizenship pre-filter ────────────────────────────────────────────────
  // Exclude opps with explicit nationality restrictions that don't match either
  // of the user's citizenships.
  const citizenshipFiltered = (citizenship || citizenship2)
    ? opportunities.filter((opp) => {
        const nats = opp.eligible_nationalities ?? [];
        if (nats.length === 0) return true;
        if (nats.includes('global')) return true;
        if (citizenship && nats.includes(citizenship)) return true;
        if (citizenship2 && nats.includes(citizenship2)) return true;
        return false;
      })
    : opportunities;

  // ── Age pre-filter ────────────────────────────────────────────────────────
  // Exclude opps where the user's age is outside the stated min/max requirement.
  const userAge: number | null = user.date_of_birth
    ? (() => {
        const dob = new Date(user.date_of_birth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
      })()
    : null;

  const ageFiltered = userAge !== null
    ? citizenshipFiltered.filter((opp) => {
        if (opp.min_age !== null && userAge < opp.min_age) return false;
        if (opp.max_age !== null && userAge > opp.max_age) return false;
        return true;
      })
    : citizenshipFiltered;

  // No preferences → generic digest (from age-filtered pool)
  if (!hasTypes && !hasRegions) {
    return {
      opportunities: ageFiltered.slice(0, GENERIC_LIMIT),
      isPersonalized: false,
    };
  }

  // Build preference sets for O(1) lookups
  const typeSet = new Set(user.types_of_interest);
  const regionSet = new Set(user.regions_of_interest);

  const hasKeywords = user.digest_keywords.length > 0;
  const keywords = user.digest_keywords.map(k => k.toLowerCase());

  const matched = ageFiltered.filter((opp) => {
    // Match type (if user has type preferences)
    if (hasTypes && typeSet.has(opp.type)) return true;

    // Match region (if user has region preferences)
    if (hasRegions && opp.regions.some((r) => regionSet.has(r))) return true;

    // Match keyword against title + summary + organization
    if (hasKeywords) {
      const searchText = [opp.title, opp.summary ?? '', opp.organization ?? '']
        .join(' ')
        .toLowerCase();
      if (keywords.some(kw => searchText.includes(kw))) return true;
    }

    return false;
  });

  // If preferences yielded no matches, fall back to generic (age-filtered)
  if (matched.length === 0) {
    return {
      opportunities: ageFiltered.slice(0, GENERIC_LIMIT),
      isPersonalized: false,
    };
  }

  return {
    opportunities: matched.slice(0, PERSONALIZED_LIMIT),
    isPersonalized: true,
  };
}

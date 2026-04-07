import type { Opportunity } from '@/types/opportunity.js';

export type DigestUser = {
  id: string;
  email: string;
  display_name: string | null;
  regions_of_interest: string[];
  types_of_interest: string[];
  reminders_enabled: boolean;
  /** True if user has bookmarked at least one opportunity — enables semantic matching */
  has_save_history: boolean;
};

export type PersonalizedDigestResult = {
  sent: number;
  skipped: number;
  failed: number;
  generic: number; // users with no prefs who got generic digest
};

export type TrendingOpportunity = {
  opportunity: Opportunity;
  save_count: number;
};

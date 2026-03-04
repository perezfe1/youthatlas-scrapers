// --- Enums as const arrays (not string literals scattered through code) ---
export const OPPORTUNITY_TYPES = [
  'scholarship', 'fellowship', 'internship', 'grant',
  'conference', 'job', 'competition', 'training',
] as const;
export type OpportunityType = typeof OPPORTUNITY_TYPES[number];

export const REGIONS = [
  'global', 'africa', 'asia', 'europe', 'latin_america',
  'north_america', 'middle_east', 'oceania',
] as const;
export type Region = typeof REGIONS[number];

export const EDUCATION_LEVELS = [
  'high_school', 'undergraduate', 'graduate',
  'postdoc', 'professional', 'any',
] as const;
export type EducationLevel = typeof EDUCATION_LEVELS[number];

export const OPPORTUNITY_STATUSES = [
  'active', 'expired', 'flagged', 'removed',
] as const;
export type OpportunityStatus = typeof OPPORTUNITY_STATUSES[number];

export const VERIFICATION_LEVELS = [
  'basic', 'verified', 'gold',
] as const;
export type VerificationLevel = typeof VERIFICATION_LEVELS[number];

export const SCAM_RISK_LEVELS = [
  'low', 'medium', 'high',
] as const;
export type ScamRiskLevel = typeof SCAM_RISK_LEVELS[number];

// --- Core record type ---
export interface Opportunity {
  id: string;
  title: string;
  slug: string;
  description: string;
  summary: string;
  type: OpportunityType;
  fields: string[];
  regions: Region[];
  countries: string[];
  target_audience: EducationLevel[];
  eligibility_text: string;
  deadline: string | null;
  deadline_text: string | null;
  is_rolling: boolean;
  funding_amount: string | null;
  is_fully_funded: boolean;
  source_url: string;
  source_site: string;
  organization: string;
  application_url: string | null;
  status: OpportunityStatus;
  verification_level: VerificationLevel;
  scam_risk: ScamRiskLevel;
  completeness_score: number;
  created_at: string;
  updated_at: string;
}

// --- What Claude API returns after extraction (subset) ---
export interface ExtractedOpportunity {
  title: string;
  description: string;
  summary: string;
  type: OpportunityType;
  fields: string[];
  regions: Region[];
  countries: string[];
  target_audience: EducationLevel[];
  eligibility_text: string;
  deadline: string | null;
  is_rolling: boolean;
  funding_amount: string | null;
  is_fully_funded: boolean;
  organization: string;
  application_url: string | null;
}

// --- Result tuple — all service functions return this, never throw ---
export interface AppError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: AppError };

// --- Filter types for the browse/search page ---
export interface OpportunityFilters {
  type?: OpportunityType;
  region?: Region;
  field?: string;
  education_level?: EducationLevel;
  is_fully_funded?: boolean;
  deadline_before?: string;
  search_query?: string;
  page?: number;
  page_size?: number;
}

export const DEFAULT_PAGE_SIZE = 20;

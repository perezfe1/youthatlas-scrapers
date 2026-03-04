-- YouthAtlas Database Schema
-- Run this entire file in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Generated from individual migrations 001-010

-----------------------------------------------------------
-- 001: Create opportunities table
-----------------------------------------------------------
CREATE TABLE public.opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  summary TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'scholarship', 'fellowship', 'internship', 'grant',
    'conference', 'job', 'competition', 'training'
  )),
  fields TEXT[] DEFAULT '{}',
  regions TEXT[] DEFAULT '{}',
  countries TEXT[] DEFAULT '{}',
  target_audience TEXT[] DEFAULT '{}',
  eligibility_text TEXT,
  deadline DATE,
  deadline_text TEXT,
  is_rolling BOOLEAN DEFAULT false,
  funding_amount TEXT,
  is_fully_funded BOOLEAN DEFAULT false,
  source_url TEXT NOT NULL,
  source_site TEXT NOT NULL,
  organization TEXT,
  application_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'flagged', 'removed')),
  verification_level TEXT DEFAULT 'basic' CHECK (verification_level IN ('basic', 'verified', 'gold')),
  scam_risk TEXT DEFAULT 'low' CHECK (scam_risk IN ('low', 'medium', 'high')),
  completeness_score INTEGER DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  source_hash TEXT,
  raw_html TEXT,
  ai_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.opportunities IS 'Core opportunity listings scraped and processed by the ingestion pipeline';

-----------------------------------------------------------
-- 002: Indexes
-----------------------------------------------------------
CREATE INDEX idx_opp_deadline ON public.opportunities (deadline)
  WHERE status = 'active';

CREATE INDEX idx_opp_type ON public.opportunities (type);

CREATE INDEX idx_opp_status ON public.opportunities (status);

CREATE INDEX idx_opp_source_hash ON public.opportunities (source_hash);

CREATE INDEX idx_opp_regions ON public.opportunities USING GIN (regions);

CREATE INDEX idx_opp_fields ON public.opportunities USING GIN (fields);

CREATE INDEX idx_opp_target_audience ON public.opportunities USING GIN (target_audience);

CREATE INDEX idx_opp_created_at ON public.opportunities (created_at DESC);

CREATE INDEX idx_opp_source_site ON public.opportunities (source_site);

-----------------------------------------------------------
-- 003: Full-text search
-----------------------------------------------------------
-- Full-text search column (auto-generated from title + description + organization)
ALTER TABLE public.opportunities ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(organization, '')), 'C')
  ) STORED;

CREATE INDEX idx_opp_fts ON public.opportunities USING GIN (fts);

-----------------------------------------------------------
-- 004: User profiles
-----------------------------------------------------------
CREATE TABLE public.user_profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  nationality TEXT,
  field_of_study TEXT,
  education_level TEXT CHECK (education_level IS NULL OR education_level IN (
    'high_school', 'undergraduate', 'graduate', 'postdoc', 'professional', 'any'
  )),
  interests TEXT[] DEFAULT '{}',
  regions_of_interest TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_profiles IS 'Extended profile info for registered users';

-----------------------------------------------------------
-- 005: Saved opportunities (user bookmarks)
-----------------------------------------------------------
CREATE TABLE public.saved_opportunities (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX idx_saved_user ON public.saved_opportunities (user_id);
CREATE INDEX idx_saved_opp ON public.saved_opportunities (opportunity_id);

COMMENT ON TABLE public.saved_opportunities IS 'User bookmarks — which opportunities they saved';

-----------------------------------------------------------
-- 006: Distribution log
-----------------------------------------------------------
CREATE TABLE public.distribution_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID REFERENCES public.opportunities ON DELETE SET NULL,
  channel TEXT NOT NULL,
  channel_detail TEXT,
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending'))
);

CREATE INDEX idx_dist_channel ON public.distribution_log (channel);
CREATE INDEX idx_dist_opp ON public.distribution_log (opportunity_id);
CREATE INDEX idx_dist_posted ON public.distribution_log (posted_at DESC);

COMMENT ON TABLE public.distribution_log IS 'Tracks which opportunities were posted to which channels';

-----------------------------------------------------------
-- 007: Scrape runs (pipeline health monitoring)
-----------------------------------------------------------
CREATE TABLE public.scrape_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_site TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'partial')),
  listings_found INTEGER DEFAULT 0,
  listings_new INTEGER DEFAULT 0,
  listings_duplicate INTEGER DEFAULT 0,
  error_message TEXT,
  duration_seconds INTEGER
);

CREATE INDEX idx_scrape_source ON public.scrape_runs (source_site);
CREATE INDEX idx_scrape_status ON public.scrape_runs (status);
CREATE INDEX idx_scrape_started ON public.scrape_runs (started_at DESC);

COMMENT ON TABLE public.scrape_runs IS 'Pipeline health monitoring — one row per scraper per run';

-----------------------------------------------------------
-- 008: Flagged listings (human review queue)
-----------------------------------------------------------
CREATE TABLE public.flagged_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID REFERENCES public.opportunities ON DELETE CASCADE,
  flag_reason TEXT NOT NULL,
  details TEXT,
  auto_flagged BOOLEAN DEFAULT true,
  reviewed BOOLEAN DEFAULT false,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flagged_unreviewed ON public.flagged_listings (reviewed)
  WHERE reviewed = false;
CREATE INDEX idx_flagged_opp ON public.flagged_listings (opportunity_id);

COMMENT ON TABLE public.flagged_listings IS 'Human review queue for suspicious or incomplete listings';

-----------------------------------------------------------
-- 009: updated_at trigger
-----------------------------------------------------------
-- Auto-update the updated_at column on any row change
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_opportunities
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-----------------------------------------------------------
-- 010: Row Level Security policies
-----------------------------------------------------------
-- RLS is enabled by default on all tables (Supabase setting).
-- These policies define who can do what.

-- OPPORTUNITIES: everyone can read active listings, only service role can write
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active opportunities"
  ON public.opportunities FOR SELECT
  USING (status = 'active');

CREATE POLICY "Service role can do everything on opportunities"
  ON public.opportunities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- USER_PROFILES: users can read/update their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- SAVED_OPPORTUNITIES: users can manage their own saves
ALTER TABLE public.saved_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saved"
  ON public.saved_opportunities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save opportunities"
  ON public.saved_opportunities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave opportunities"
  ON public.saved_opportunities FOR DELETE
  USING (auth.uid() = user_id);

-- DISTRIBUTION_LOG: read-only for everyone, write for service role
ALTER TABLE public.distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages distribution log"
  ON public.distribution_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- SCRAPE_RUNS: service role only
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages scrape runs"
  ON public.scrape_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- FLAGGED_LISTINGS: service role only
ALTER TABLE public.flagged_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages flagged listings"
  ON public.flagged_listings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

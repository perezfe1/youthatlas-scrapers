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

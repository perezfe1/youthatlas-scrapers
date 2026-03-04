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

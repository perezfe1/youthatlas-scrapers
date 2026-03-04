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

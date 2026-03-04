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

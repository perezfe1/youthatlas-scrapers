CREATE TABLE public.saved_opportunities (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX idx_saved_user ON public.saved_opportunities (user_id);
CREATE INDEX idx_saved_opp ON public.saved_opportunities (opportunity_id);

COMMENT ON TABLE public.saved_opportunities IS 'User bookmarks — which opportunities they saved';

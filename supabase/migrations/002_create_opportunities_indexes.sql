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

-- Full-text search column (auto-generated from title + description + organization)
ALTER TABLE public.opportunities ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(organization, '')), 'C')
  ) STORED;

CREATE INDEX idx_opp_fts ON public.opportunities USING GIN (fts);

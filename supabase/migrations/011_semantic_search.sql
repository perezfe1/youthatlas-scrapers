-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (text-embedding-3-small produces 1536-dimensional vectors)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index — faster query time than ivfflat for this dataset size
-- Uses cosine distance operator (vector_cosine_ops)
CREATE INDEX IF NOT EXISTS opportunities_embedding_idx
  ON opportunities USING hnsw (embedding vector_cosine_ops);

-- Similarity search function
-- Returns rows ordered by cosine similarity (highest first)
-- Only considers active opportunities that have been embedded
CREATE OR REPLACE FUNCTION search_opportunities_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  slug text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    slug,
    1 - (embedding <=> query_embedding) AS similarity
  FROM opportunities
  WHERE
    status = 'active'
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Grant execute to anon and authenticated roles so the platform can call it
-- via the anon key Supabase client
GRANT EXECUTE ON FUNCTION search_opportunities_semantic TO anon, authenticated;

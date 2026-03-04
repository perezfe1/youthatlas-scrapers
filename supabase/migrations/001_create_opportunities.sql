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

CREATE TABLE featured_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name text NOT NULL,
  contact_email text NOT NULL,
  opportunity_title text NOT NULL,
  opportunity_url text NOT NULL,
  opportunity_description text,
  message text,
  is_active boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: public can insert (form submissions), service role manages all
ALTER TABLE featured_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit" ON featured_listings FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access" ON featured_listings USING (auth.role() = 'service_role');

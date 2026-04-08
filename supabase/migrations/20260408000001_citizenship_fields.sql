-- Add country_of_citizenship to user profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS country_of_citizenship text;

-- Add eligible_nationalities to opportunities
-- Empty array = unknown/open (safe default for existing records)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS eligible_nationalities text[] NOT NULL DEFAULT '{}';

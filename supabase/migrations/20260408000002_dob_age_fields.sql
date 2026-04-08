-- Add date of birth and second citizenship to user profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS country_of_citizenship_2 text;

-- Add age requirements to opportunities
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS min_age integer,
  ADD COLUMN IF NOT EXISTS max_age integer;

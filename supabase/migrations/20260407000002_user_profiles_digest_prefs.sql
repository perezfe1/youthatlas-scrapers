-- Digest preference controls for users
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS digest_frequency varchar(10) NOT NULL DEFAULT 'weekly'
    CHECK (digest_frequency IN ('weekly', 'biweekly')),
  ADD COLUMN IF NOT EXISTS digest_keywords text[] NOT NULL DEFAULT '{}';

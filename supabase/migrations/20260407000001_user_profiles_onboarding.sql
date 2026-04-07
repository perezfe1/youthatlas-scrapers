-- Track whether the onboarding email has been sent to each user.
-- NULL = not yet sent. Set to the timestamp when the email is dispatched.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_email_sent_at timestamptz;

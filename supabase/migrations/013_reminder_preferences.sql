CREATE TABLE reminder_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminders_enabled boolean NOT NULL DEFAULT true,
  unsubscribe_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE reminder_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON reminder_preferences USING (auth.role() = 'service_role');

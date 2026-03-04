CREATE TABLE public.user_profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  nationality TEXT,
  field_of_study TEXT,
  education_level TEXT CHECK (education_level IS NULL OR education_level IN (
    'high_school', 'undergraduate', 'graduate', 'postdoc', 'professional', 'any'
  )),
  interests TEXT[] DEFAULT '{}',
  regions_of_interest TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_profiles IS 'Extended profile info for registered users';

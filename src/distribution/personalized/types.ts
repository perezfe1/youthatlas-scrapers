export type DigestUser = {
  id: string;
  email: string;
  display_name: string | null;
  regions_of_interest: string[];
  types_of_interest: string[];
  reminders_enabled: boolean;
};

export type PersonalizedDigestResult = {
  sent: number;
  skipped: number;
  failed: number;
  generic: number; // users with no prefs who got generic digest
};

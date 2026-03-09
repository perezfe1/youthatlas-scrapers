export type ReminderOpportunity = {
  title: string;
  organization: string | null;
  deadline: string;
  applyUrl: string | null;
  sourceUrl: string;
  slug: string;
  type: string;
};

export type UserReminder = {
  userId: string;
  email: string;
  opportunities: ReminderOpportunity[];
};

export type ReminderResult = {
  sent: number;
  failed: number;
  skipped: number;
};

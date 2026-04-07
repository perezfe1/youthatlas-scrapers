export type PushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon?: string;
};

export type PushResult = {
  sent: number;
  failed: number;
  expired: number; // subscriptions that were removed (410 Gone)
};

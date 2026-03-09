import { getSupabaseClient } from '@/lib/supabase.js';
import { createLogger } from '@/lib/logger.js';

import type { Result } from '@/types/opportunity.js';
import type { ReminderOpportunity, UserReminder } from './types.js';

const log = createLogger('reminders-query');

// ── Local DB row shapes ────────────────────────────────────────────────────────

type OppRow = {
  id: string;
  title: string;
  organization: string | null;
  deadline: string;
  application_url: string | null;
  source_url: string;
  slug: string;
  type: string;
};

type SaveRow = {
  user_id: string;
  opportunity_id: string;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return one UserReminder per user who has saved at least one opportunity
 * whose deadline::date equals today + daysAhead (UTC).
 * Users without an email in auth.users are logged as warnings and skipped.
 */
export async function getUsersWithUpcomingDeadlines(
  daysAhead: number,
): Promise<Result<UserReminder[]>> {
  try {
    const supabase = getSupabaseClient();

    // Target date: today + daysAhead, UTC, date-only string (YYYY-MM-DD)
    const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]!;

    log.info('Querying opportunities with deadline on target date', { targetDate, daysAhead });

    // ── Step 1: opportunities closing on target date ───────────────────────────

    const { data: oppsRaw, error: oppsError } = await supabase
      .from('opportunities')
      .select('id, title, organization, deadline, application_url, source_url, slug, type')
      .eq('status', 'active')
      .not('deadline', 'is', null)
      .filter('deadline::date', 'eq', targetDate);

    if (oppsError) {
      return {
        data: null,
        error: { code: 'DB_ERROR', message: `Failed to query opportunities: ${oppsError.message}` },
      };
    }

    const opps = (oppsRaw ?? []) as OppRow[];

    if (opps.length === 0) {
      log.info('No active opportunities found closing on target date', { targetDate });
      return { data: [], error: null };
    }

    log.info('Found opportunities closing on target date', { count: opps.length, targetDate });

    // ── Step 2: saved_opportunities for those opportunity IDs ─────────────────

    const oppIds = opps.map((o) => o.id);

    const { data: savesRaw, error: savesError } = await supabase
      .from('saved_opportunities')
      .select('user_id, opportunity_id')
      .in('opportunity_id', oppIds);

    if (savesError) {
      return {
        data: null,
        error: {
          code: 'DB_ERROR',
          message: `Failed to query saved_opportunities: ${savesError.message}`,
        },
      };
    }

    const saves = (savesRaw ?? []) as SaveRow[];

    if (saves.length === 0) {
      log.info('No users have saved any of the closing opportunities');
      return { data: [], error: null };
    }

    log.info('Found saved opportunity entries', { count: saves.length });

    // ── Step 3: email lookup via auth.users ───────────────────────────────────

    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (usersError) {
      return {
        data: null,
        error: { code: 'AUTH_ERROR', message: `Failed to list users: ${usersError.message}` },
      };
    }

    if (usersData.users.length === 1000) {
      log.warn(
        'listUsers() returned exactly 1000 users — pagination may be needed for larger user bases',
      );
    }

    // Build userId → email map (only include users that have an email)
    const emailMap = new Map<string, string>();
    for (const user of usersData.users) {
      if (user.email) {
        emailMap.set(user.id, user.email);
      }
    }

    // ── Step 4: build opportunity lookup map ──────────────────────────────────

    const oppMap = new Map<string, OppRow>(opps.map((o) => [o.id, o]));

    // ── Step 5: group saves by user_id ────────────────────────────────────────

    const userOppMap = new Map<string, ReminderOpportunity[]>();
    const skippedUsers = new Set<string>();

    for (const save of saves) {
      const { user_id: userId, opportunity_id: oppId } = save;

      if (!emailMap.has(userId)) {
        if (!skippedUsers.has(userId)) {
          log.warn('No email found for user — skipping', { userId });
          skippedUsers.add(userId);
        }
        continue;
      }

      const opp = oppMap.get(oppId);
      if (!opp) continue;

      const reminderOpp: ReminderOpportunity = {
        title: opp.title,
        organization: opp.organization ?? null,
        deadline: opp.deadline,
        applyUrl: opp.application_url ?? null,
        sourceUrl: opp.source_url,
        slug: opp.slug,
        type: opp.type,
      };

      const existing = userOppMap.get(userId);
      if (existing) {
        existing.push(reminderOpp);
      } else {
        userOppMap.set(userId, [reminderOpp]);
      }
    }

    if (skippedUsers.size > 0) {
      log.info('Skipped users with no email', { skipped: skippedUsers.size });
    }

    // ── Step 6: assemble UserReminder[] ──────────────────────────────────────

    const reminders: UserReminder[] = [];
    for (const [userId, opportunities] of userOppMap) {
      reminders.push({ userId, email: emailMap.get(userId)!, opportunities });
    }

    log.info('Assembled user reminders', { users: reminders.length });
    return { data: reminders, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

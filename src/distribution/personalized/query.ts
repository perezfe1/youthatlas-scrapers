import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import type { Opportunity, Result } from '@/types/opportunity.js';
import type { DigestUser } from './types.js';

const log = createLogger('personalized-digest:query');

// Columns needed for digest emails — never select embedding or fts
const DIGEST_COLUMNS = [
  'id', 'title', 'slug', 'type', 'summary', 'organization',
  'regions', 'deadline', 'is_rolling', 'is_fully_funded',
  'completeness_score', 'created_at', 'status', 'application_url',
].join(',');

// ── Users ────────────────────────────────────────────────────────────────────

/**
 * Fetch all registered users with their email and preferences.
 * Merges user_profiles with auth.users (for email) and filters out
 * users who opted out via reminder_preferences.
 */
export async function getUsersForDigest(): Promise<Result<DigestUser[]>> {
  try {
    const supabase = getSupabaseClient();

    // Step 1: Get all user profiles
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, display_name, regions_of_interest, types_of_interest');

    if (profileError) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to query user_profiles: ${profileError.message}` } };
    }

    if (!profiles || profiles.length === 0) {
      log.info('No user profiles found');
      return { data: [], error: null };
    }

    // Step 2: Get emails from auth.users via admin API
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authError) {
      return { data: null, error: { code: 'AUTH_ERROR', message: `Failed to list auth users: ${authError.message}` } };
    }

    const emailMap = new Map<string, string>();
    for (const user of authData.users) {
      if (user.email) {
        emailMap.set(user.id, user.email);
      }
    }

    // Step 3: Get opt-out preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('reminder_preferences')
      .select('user_id, reminders_enabled')
      .eq('reminders_enabled', false);

    if (prefsError) {
      log.warn('Failed to query reminder_preferences — proceeding without opt-out filtering', {
        error: prefsError.message,
      });
    }

    const optedOutIds = new Set(
      (prefs ?? []).map((p: { user_id: string }) => p.user_id),
    );

    // Step 4: Merge profiles with emails, filter opt-outs
    const users: DigestUser[] = [];

    for (const profile of profiles) {
      const email = emailMap.get(profile.id as string);
      if (!email) continue; // no email found, skip
      if (optedOutIds.has(profile.id as string)) continue; // opted out

      users.push({
        id: profile.id as string,
        email,
        display_name: (profile.display_name as string) ?? null,
        regions_of_interest: (profile.regions_of_interest as string[]) ?? [],
        types_of_interest: (profile.types_of_interest as string[]) ?? [],
        reminders_enabled: true,
      });
    }

    log.info('Users eligible for personalized digest', {
      totalProfiles: profiles.length,
      withEmail: emailMap.size,
      optedOut: optedOutIds.size,
      eligible: users.length,
    });

    // Step 5: Enrich users with no explicit prefs — infer from their save history
    const usersWithNoPrefs = users.filter(
      u => u.types_of_interest.length === 0 && u.regions_of_interest.length === 0,
    );

    if (usersWithNoPrefs.length > 0) {
      const noPrefsIds = usersWithNoPrefs.map(u => u.id);

      const { data: saves, error: savesError } = await supabase
        .from('saved_opportunities')
        .select('user_id, opportunities(type, regions)')
        .in('user_id', noPrefsIds);

      if (!savesError && saves) {
        const saveMap = new Map<string, { types: Set<string>; regions: Set<string> }>();
        for (const save of saves as unknown as Array<{ user_id: string; opportunities: { type: string; regions: string[] } | null }>) {
          if (!save.opportunities) continue;
          if (!saveMap.has(save.user_id)) {
            saveMap.set(save.user_id, { types: new Set(), regions: new Set() });
          }
          const entry = saveMap.get(save.user_id)!;
          entry.types.add(save.opportunities.type);
          for (const r of save.opportunities.regions) entry.regions.add(r);
        }

        for (const user of usersWithNoPrefs) {
          const inferred = saveMap.get(user.id);
          if (!inferred) continue;
          if (inferred.types.size > 0) user.types_of_interest = [...inferred.types];
          if (inferred.regions.size > 0) user.regions_of_interest = [...inferred.regions];
        }

        log.info('Inferred preferences from saves', { usersEnriched: saveMap.size });
      }
    }

    return { data: users, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── Opportunities ────────────────────────────────────────────────────────────

/**
 * Fetch active, non-expired opportunities created within the lookback window.
 * Ordered by completeness_score DESC.
 */
export async function getDigestOpportunities(
  lookbackDays: number = 7,
): Promise<Result<Opportunity[]>> {
  try {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0]!;
    const lookbackDate = new Date(
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from('opportunities')
      .select(DIGEST_COLUMNS)
      .eq('status', 'active')
      .gte('created_at', lookbackDate)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order('completeness_score', { ascending: false })
      .limit(200);

    if (error) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to query opportunities: ${error.message}` } };
    }

    const opportunities = (data ?? []) as unknown as Opportunity[];
    log.info('Fetched digest opportunities', { count: opportunities.length, lookbackDays });

    return { data: opportunities, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── Closing Soon ──────────────────────────────────────────────────────────────

/**
 * Fetch active opportunities with a deadline within the next `days` days.
 * Ordered by deadline ASC (most urgent first).
 */
export async function getClosingSoonOpportunities(
  days: number = 7,
): Promise<Result<Opportunity[]>> {
  try {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0]!;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]!;

    const { data, error } = await supabase
      .from('opportunities')
      .select(DIGEST_COLUMNS)
      .eq('status', 'active')
      .gte('deadline', today)
      .lte('deadline', cutoff)
      .order('deadline', { ascending: true })
      .limit(30);

    if (error) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to query closing-soon opportunities: ${error.message}` } };
    }

    const opportunities = (data ?? []) as unknown as Opportunity[];
    log.info('Fetched closing-soon opportunities', { count: opportunities.length, days });
    return { data: opportunities, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

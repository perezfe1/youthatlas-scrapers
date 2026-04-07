import { createLogger } from '@/lib/logger.js';
import { getSupabaseClient } from '@/lib/supabase.js';
import type { Opportunity, Result } from '@/types/opportunity.js';
import type { DigestUser, TrendingOpportunity } from './types.js';

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
      .select('id, display_name, regions_of_interest, types_of_interest, digest_frequency, digest_keywords');

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
        has_save_history: false, // will be set in step 5
        digest_frequency: ((profile.digest_frequency as string) ?? 'weekly') as 'weekly' | 'biweekly',
        digest_keywords: (profile.digest_keywords as string[]) ?? [],
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
          user.has_save_history = true;
        }

        log.info('Inferred preferences from saves', { usersEnriched: saveMap.size });
      }
    }

    // Step 6: Mark users WITH explicit prefs who also have save history
    const usersWithExplicitPrefs = users.filter(
      u => !u.has_save_history && (u.types_of_interest.length > 0 || u.regions_of_interest.length > 0),
    );
    if (usersWithExplicitPrefs.length > 0) {
      const { data: saveCounts } = await supabase
        .from('saved_opportunities')
        .select('user_id')
        .in('user_id', usersWithExplicitPrefs.map(u => u.id));
      if (saveCounts) {
        const idsWithSaves = new Set(
          (saveCounts as Array<{ user_id: string }>).map(s => s.user_id),
        );
        for (const user of usersWithExplicitPrefs) {
          if (idsWithSaves.has(user.id)) user.has_save_history = true;
        }
      }
    }

    log.info('Users with save history', {
      count: users.filter(u => u.has_save_history).length,
    });

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

// ── Embeddings ────────────────────────────────────────────────────────────────

/**
 * Fetch embeddings for a specific set of opportunity IDs (the digest pool).
 * Returns a Map<oppId, number[]> for fast lookup.
 * Embeddings come back as strings from pgvector — parsed here.
 */
export async function getPoolEmbeddings(
  oppIds: string[],
): Promise<Result<Map<string, number[]>>> {
  if (oppIds.length === 0) return { data: new Map(), error: null };
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('opportunities')
      .select('id, embedding')
      .in('id', oppIds);

    if (error) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to fetch pool embeddings: ${error.message}` } };
    }

    const map = new Map<string, number[]>();
    for (const row of (data ?? []) as unknown as Array<{ id: string; embedding: string | number[] | null }>) {
      if (!row.embedding) continue;
      const vec = typeof row.embedding === 'string'
        ? JSON.parse(row.embedding) as number[]
        : row.embedding;
      map.set(row.id, vec);
    }

    log.info('Fetched pool embeddings', { requested: oppIds.length, found: map.size });
    return { data: map, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/**
 * Fetch embeddings of all saved opportunities for a set of user IDs.
 * Returns a Map<userId, number[][]> — each user maps to their array of saved embeddings.
 */
export async function getUserSaveEmbeddings(
  userIds: string[],
): Promise<Result<Map<string, number[][]>>> {
  if (userIds.length === 0) return { data: new Map(), error: null };
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('saved_opportunities')
      .select('user_id, opportunities(embedding)')
      .in('user_id', userIds);

    if (error) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to fetch save embeddings: ${error.message}` } };
    }

    const map = new Map<string, number[][]>();
    for (const row of (data ?? []) as unknown as Array<{ user_id: string; opportunities: { embedding: string | number[] | null } | null }>) {
      if (!row.opportunities?.embedding) continue;
      const vec = typeof row.opportunities.embedding === 'string'
        ? JSON.parse(row.opportunities.embedding) as number[]
        : row.opportunities.embedding;
      if (!map.has(row.user_id)) map.set(row.user_id, []);
      map.get(row.user_id)!.push(vec);
    }

    log.info('Fetched user save embeddings', {
      usersRequested: userIds.length,
      usersWithEmbeddings: map.size,
    });
    return { data: map, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ── Trending ──────────────────────────────────────────────────────────────────

/**
 * Find the most-saved opportunities in the last `lookbackDays` days.
 * Counts saves in JS (no RPC needed). Only includes opps with >= minSaves.
 */
export async function getTrendingOpportunities(
  lookbackDays: number = 7,
  minSaves: number = 2,
  limit: number = 3,
): Promise<Result<TrendingOpportunity[]>> {
  try {
    const supabase = getSupabaseClient();
    const lookbackDate = new Date(
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Step 1: Fetch save events in the window
    const { data: saves, error: savesError } = await supabase
      .from('saved_opportunities')
      .select('opportunity_id')
      .gte('created_at', lookbackDate)
      .limit(2000);

    if (savesError) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to query saves: ${savesError.message}` } };
    }

    // Step 2: Count in JS
    const counts = new Map<string, number>();
    for (const row of (saves ?? []) as Array<{ opportunity_id: string }>) {
      counts.set(row.opportunity_id, (counts.get(row.opportunity_id) ?? 0) + 1);
    }

    const topIds = [...counts.entries()]
      .filter(([, count]) => count >= minSaves)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (topIds.length === 0) {
      log.info('No trending opportunities this week (not enough saves)');
      return { data: [], error: null };
    }

    // Step 3: Fetch opportunity details for the top IDs
    const today = new Date().toISOString().split('T')[0]!;
    const { data: opps, error: oppsError } = await supabase
      .from('opportunities')
      .select(DIGEST_COLUMNS)
      .in('id', topIds.map(([id]) => id))
      .eq('status', 'active')
      .or(`deadline.is.null,deadline.gte.${today}`);

    if (oppsError) {
      return { data: null, error: { code: 'DB_ERROR', message: `Failed to fetch trending opps: ${oppsError.message}` } };
    }

    const oppsById = new Map(
      ((opps ?? []) as unknown as Opportunity[]).map(o => [o.id, o]),
    );

    // Preserve save-count order
    const trending: TrendingOpportunity[] = [];
    for (const [id, count] of topIds) {
      const opp = oppsById.get(id);
      if (opp) trending.push({ opportunity: opp, save_count: count });
    }

    log.info('Trending opportunities', { count: trending.length });
    return { data: trending, error: null };
  } catch (err) {
    return {
      data: null,
      error: { code: 'UNEXPECTED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

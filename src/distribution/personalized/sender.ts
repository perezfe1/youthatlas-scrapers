import { Resend } from 'resend';

import { createLogger } from '@/lib/logger.js';
import { matchOpportunitiesForUser } from './matcher.js';
import { formatPersonalizedDigest } from './email-template.js';
import { semanticRankOpportunities, averageVectors, blendMatches } from './semantic-matcher.js';
import { getPoolEmbeddings, getUserSaveEmbeddings } from './query.js';
import type { Opportunity, Result } from '@/types/opportunity.js';
import type { DigestUser, PersonalizedDigestResult, TrendingOpportunity } from './types.js';

const log = createLogger('personalized-digest:sender');

const FROM_ADDRESS = 'YouthAtlas <digest@youthatlas.com>';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send personalized digest emails to all eligible users.
 *
 * Matching strategy (in priority order):
 * 1. Semantic + keyword blend — users with save history get semantic matching
 *    supplemented on top of keyword matches.
 * 2. Keyword only — users with explicit prefs but no saves.
 * 3. Generic top-N — users with no prefs and no saves.
 */
export async function sendPersonalizedDigests(
  users: DigestUser[],
  opportunities: Opportunity[],
  closingSoonOpps: Opportunity[] = [],
  trendingOpps: TrendingOpportunity[] = [],
): Promise<Result<PersonalizedDigestResult>> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { data: null, error: { code: 'MISSING_CONFIG', message: 'RESEND_API_KEY is not set' } };
  }

  const resend = new Resend(resendApiKey);
  const result: PersonalizedDigestResult = { sent: 0, skipped: 0, failed: 0, generic: 0 };

  // ── Fetch semantic data (once, for all users with save history) ─────────────
  const usersWithSaves = users.filter(u => u.has_save_history);
  let poolEmbeddings = new Map<string, number[]>();
  let userSaveEmbeddings = new Map<string, number[][]>();

  if (usersWithSaves.length > 0) {
    const oppIds = opportunities.map(o => o.id);

    const [poolResult, savesResult] = await Promise.all([
      getPoolEmbeddings(oppIds),
      getUserSaveEmbeddings(usersWithSaves.map(u => u.id)),
    ]);

    if (poolResult.error) {
      log.warn('Failed to fetch pool embeddings — falling back to keyword-only matching', {
        error: poolResult.error.message,
      });
    } else {
      poolEmbeddings = poolResult.data;
    }

    if (savesResult.error) {
      log.warn('Failed to fetch save embeddings — falling back to keyword-only matching', {
        error: savesResult.error.message,
      });
    } else {
      userSaveEmbeddings = savesResult.data;
    }

    log.info('Semantic matching ready', {
      usersWithSaves: usersWithSaves.length,
      poolEmbeddings: poolEmbeddings.size,
      usersWithSaveEmbeddings: userSaveEmbeddings.size,
    });
  }

  // ── Send per user ───────────────────────────────────────────────────────────
  for (const user of users) {
    // Step 1: keyword matching (baseline)
    const { opportunities: keywordMatched, isPersonalized: keywordPersonalized } =
      matchOpportunitiesForUser(user, opportunities);

    let finalMatches = keywordMatched;
    let isPersonalized = keywordPersonalized;

    // Step 2: semantic enhancement for users with save history
    if (user.has_save_history && poolEmbeddings.size > 0) {
      const savedEmbeddings = userSaveEmbeddings.get(user.id);
      if (savedEmbeddings && savedEmbeddings.length > 0) {
        const userVector = averageVectors(savedEmbeddings);
        if (userVector) {
          const semanticMatches = semanticRankOpportunities(
            userVector,
            opportunities,
            poolEmbeddings,
          );
          const blended = blendMatches(keywordMatched, semanticMatches);
          finalMatches = blended.opportunities;
          isPersonalized = blended.isPersonalized;

          if (blended.hasSemantic) {
            log.info('Semantic supplements added', {
              userId: user.id,
              keyword: keywordMatched.length,
              total: finalMatches.length,
            });
          }
        }
      }
    }

    if (finalMatches.length === 0) {
      log.info('No opportunities to send, skipping user', { userId: user.id });
      result.skipped++;
      continue;
    }

    // Format and send
    const { subject, html } = formatPersonalizedDigest(user, finalMatches, isPersonalized, closingSoonOpps, trendingOpps);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email,
      subject,
      html,
    });

    if (error) {
      log.warn('Failed to send digest email', { email: user.email, error: error.message });
      result.failed++;
    } else {
      log.info('Sent digest email', {
        email: user.email,
        opportunities: finalMatches.length,
        personalized: isPersonalized,
        semantic: user.has_save_history,
      });
      result.sent++;
      if (!isPersonalized) result.generic++;
    }

    // Respect Resend free-tier rate limit: 1 req/sec
    await sleep(1000);
  }

  return { data: result, error: null };
}

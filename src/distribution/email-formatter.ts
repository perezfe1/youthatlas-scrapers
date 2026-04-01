import type { Opportunity, OpportunityType } from '@/types/opportunity.js';
import { EMAIL_DIGEST } from '@/config/constants.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<OpportunityType, string> = {
  scholarship: '🎓',
  fellowship:  '🔬',
  grant:       '💰',
  internship:  '💼',
  conference:  '🎤',
  competition: '🏆',
  training:    '📚',
  award:       '🏆',
};

const TYPE_BADGE: Record<OpportunityType, { bg: string; color: string }> = {
  scholarship: { bg: '#DBEAFE', color: '#1E40AF' },
  fellowship:  { bg: '#EDE9FE', color: '#5B21B6' },
  grant:       { bg: '#D1FAE5', color: '#065F46' },
  internship:  { bg: '#FEF3C7', color: '#92400E' },
  conference:  { bg: '#CCFBF1', color: '#115E59' },
  competition: { bg: '#FFE4E6', color: '#9F1239' },
  training:    { bg: '#E0E7FF', color: '#3730A3' },
  award:       { bg: '#FFE4E6', color: '#9F1239' },
};

const BASE_URL = 'https://youthatlas.com';

// ── Pure helpers ───────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDeadline(deadline: string | null, isRolling: boolean): string {
  if (isRolling || !deadline) return 'Rolling / No deadline';
  const date = new Date(deadline);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Returns red if deadline is within 7 days, gray otherwise. */
function deadlineColor(deadline: string | null, isRolling: boolean): string {
  if (isRolling || !deadline) return '#64748B';
  const msUntil = new Date(deadline).getTime() - Date.now();
  return msUntil < 7 * 24 * 60 * 60 * 1000 ? '#DC2626' : '#64748B';
}

// ── Opportunity card ────────────────────────────────────────────────────────────

function renderOpportunityCard(opp: Opportunity): string {
  const emoji = TYPE_EMOJI[opp.type] ?? '📌';
  const typeLabel = opp.type.charAt(0).toUpperCase() + opp.type.slice(1);
  const badge = TYPE_BADGE[opp.type] ?? { bg: '#F1F5F9', color: '#475569' };
  const title = escapeHtml(opp.title);
  const org = opp.organization ? escapeHtml(opp.organization) : '';
  const deadlineText = escapeHtml(formatDeadline(opp.deadline, opp.is_rolling));
  const dlColor = deadlineColor(opp.deadline, opp.is_rolling);
  const url = `${BASE_URL}/opportunities/${opp.slug}`;

  const rawSummary = opp.summary || opp.description;
  const summary = rawSummary
    ? escapeHtml(truncate(rawSummary, EMAIL_DIGEST.MAX_SUMMARY_LENGTH))
    : '';

  const regionList =
    opp.regions && opp.regions.length > 0 ? escapeHtml(opp.regions.join(', ')) : '';

  // Region + funding row (omitted entirely if neither is present)
  const regionFundingRow = (() => {
    if (!regionList && !opp.is_fully_funded) return '';
    const parts: string[] = [];
    if (regionList) parts.push(`🌍 ${regionList}`);
    if (opp.is_fully_funded) {
      parts.push(
        `<span style="color: #059669; font-weight: 600;">✅ Fully Funded</span>`,
      );
    }
    return `<p style="margin: 0 0 10px 0; font-size: 13px; color: #64748B; font-family: Arial, Helvetica, sans-serif;">${parts.join(' &nbsp;·&nbsp; ')}</p>`;
  })();

  return `
  <!-- Opportunity Card -->
  <tr>
    <td style="padding: 0 0 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border: 1px solid #E2E8F0; border-radius: 8px; background-color: #ffffff;">
        <tr>
          <td style="padding: 20px; border-radius: 8px;">

            <!-- Badge + Deadline row -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="margin-bottom: 12px;">
              <tr>
                <td>
                  <span style="display: inline-block; background-color: ${badge.bg}; color: ${badge.color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; font-family: Arial, Helvetica, sans-serif;">${emoji} ${typeLabel}</span>
                </td>
                <td align="right">
                  <span style="font-size: 13px; color: ${dlColor}; font-family: Arial, Helvetica, sans-serif;">📅 ${deadlineText}</span>
                </td>
              </tr>
            </table>

            <!-- Title -->
            <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; line-height: 1.3; font-family: Arial, Helvetica, sans-serif;">
              <a href="${url}" style="color: #3B82F6; text-decoration: none;">${title}</a>
            </h3>

            ${org ? `<!-- Organisation -->
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748B; font-family: Arial, Helvetica, sans-serif;">🏢 ${org}</p>` : ''}

            ${regionFundingRow}

            ${summary ? `<!-- Summary -->
            <p style="margin: 0 0 14px 0; font-size: 14px; color: #374151; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">${summary}</p>` : ''}

            <!-- View & Apply button -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px;">
              <tr>
                <td style="background-color: #3B82F6; border-radius: 6px;">
                  <a href="${url}"
                     style="display: inline-block; background-color: #3B82F6; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 10px 20px; border-radius: 6px; font-family: Arial, Helvetica, sans-serif;">View &amp; Apply →</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ── Featured listing type (for email digest) ────────────────────────────────

export type FeaturedListingEmail = {
  orgName: string;
  opportunityTitle: string;
  opportunityUrl: string;
  opportunityDescription: string | null;
};

// ── Featured card ─────────────────────────────────────────────────────────────

function renderFeaturedCard(listing: FeaturedListingEmail): string {
  const title = escapeHtml(listing.opportunityTitle);
  const org = escapeHtml(listing.orgName);
  const url = listing.opportunityUrl;
  const desc = listing.opportunityDescription
    ? escapeHtml(truncate(listing.opportunityDescription, 200))
    : '';

  return `
  <!-- Featured Card -->
  <tr>
    <td style="padding: 0 0 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border: 1px solid #F59E0B; border-radius: 8px; background-color: #FFFBEB;">
        <tr>
          <td style="padding: 20px; border-radius: 8px;">

            <!-- Featured badge -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="margin-bottom: 12px;">
              <tr>
                <td>
                  <span style="display: inline-block; background-color: #FEF3C7; color: #92400E; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; font-family: Arial, Helvetica, sans-serif;">⭐ Featured</span>
                </td>
              </tr>
            </table>

            <!-- Title -->
            <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; line-height: 1.3; font-family: Arial, Helvetica, sans-serif;">
              <a href="${url}" style="color: #B45309; text-decoration: none;">${title}</a>
            </h3>

            <!-- Organisation -->
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #78716C; font-family: Arial, Helvetica, sans-serif;">🏢 ${org}</p>

            ${desc ? `<!-- Description -->
            <p style="margin: 0 0 14px 0; font-size: 14px; color: #374151; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">${desc}</p>` : ''}

            <!-- Learn More button -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px;">
              <tr>
                <td style="background-color: #F59E0B; border-radius: 6px;">
                  <a href="${url}"
                     style="display: inline-block; background-color: #F59E0B; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 10px 20px; border-radius: 6px; font-family: Arial, Helvetica, sans-serif;">Learn More →</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ── Featured section renderer ────────────────────────────────────────────────

function renderFeaturedSection(listings: FeaturedListingEmail[]): string {
  if (listings.length === 0) return '';

  const cards = listings.map(renderFeaturedCard).join('\n');

  return `
          <!-- Featured Opportunities Section -->
          <tr>
            <td style="background-color: #ffffff; padding: 0 32px 8px 32px;">
              <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #92400E; font-family: Arial, Helvetica, sans-serif;">⭐ Featured Opportunities</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${cards}
              </table>
              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 8px 0 0 0;">
            </td>
          </tr>`;
}

// ── Public formatter ───────────────────────────────────────────────────────────

/**
 * Format a list of opportunities into a weekly digest email.
 * Returns the email subject and HTML body with inline styles.
 * HTML is table-based with inline styles for maximum email client compatibility
 * (Gmail, Outlook, Apple Mail).
 *
 * Optionally includes a featured listings section at the top.
 */
export function formatWeeklyDigest(
  opportunities: Opportunity[],
  featuredListings?: FeaturedListingEmail[],
): { subject: string; html: string } {
  const count = opportunities.length;
  const subject = `YouthAtlas Weekly: ${count} New Opportunit${count === 1 ? 'y' : 'ies'} This Week`;

  const capped = opportunities.slice(0, EMAIL_DIGEST.MAX_OPPORTUNITIES);
  const cards = capped.map(renderOpportunityCard).join('\n');
  const featuredSection = renderFeaturedSection(featuredListings ?? []);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color: #F1F5F9;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Inner card — 600px max -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width: 600px;">

          <!-- ① Header -->
          <tr>
            <td align="center"
                style="background-color: #1A1A2E; padding: 32px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; font-family: Arial, Helvetica, sans-serif;">
                Youth<span style="color: #60A5FA;">Atlas</span>
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #94A3B8; font-family: Arial, Helvetica, sans-serif;">
                Your weekly opportunity digest
              </p>
            </td>
          </tr>

          <!-- ② Intro -->
          <tr>
            <td style="background-color: #ffffff; padding: 24px 32px 0 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #1A1A2E; font-family: Arial, Helvetica, sans-serif;">Hi there 👋</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748B; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                Here are the top ${count} ${count === 1 ? 'opportunity' : 'opportunities'} added this week. Don&apos;t miss out &mdash; deadlines are approaching!
              </p>
              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 0 0 20px 0;">
            </td>
          </tr>

          ${featuredSection}

          <!-- ③ Opportunity Cards -->
          <tr>
            <td style="background-color: #ffffff; padding: 0 32px 8px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${cards}
              </table>
            </td>
          </tr>

          <!-- ④ CTA Section -->
          <tr>
            <td align="center" style="background-color: #EFF6FF; padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #1A1A2E; font-family: Arial, Helvetica, sans-serif;">Want to see more?</p>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #3B82F6; border-radius: 8px;">
                    <a href="${BASE_URL}/opportunities"
                       style="display: inline-block; background-color: #3B82F6; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 28px; border-radius: 8px; font-family: Arial, Helvetica, sans-serif;">Browse All Opportunities →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ⑤ Social Section -->
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 24px 32px;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #94A3B8; font-family: Arial, Helvetica, sans-serif;">Follow us for daily updates:</p>
              <p style="margin: 0 0 6px 0; font-size: 14px; font-family: Arial, Helvetica, sans-serif;">
                📱 Telegram: <a href="https://t.me/youthatlas1" style="color: #3B82F6; text-decoration: none; font-weight: 600;">@youthatlas1</a>
              </p>
              <p style="margin: 0; font-size: 14px; font-family: Arial, Helvetica, sans-serif;">
                🌐 Website: <a href="${BASE_URL}" style="color: #3B82F6; text-decoration: none; font-weight: 600;">youthatlas.com</a>
              </p>
            </td>
          </tr>

          <!-- ⑥ Footer -->
          <tr>
            <td align="center"
                style="background-color: #F8FAFC; padding: 24px 32px; border-radius: 0 0 8px 8px; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #94A3B8; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                You&apos;re receiving this because you subscribed to the YouthAtlas weekly digest.
              </p>
              <p style="margin: 0 0 8px 0; font-size: 12px; font-family: Arial, Helvetica, sans-serif;">
                <a href="{{ unsubscribe_url }}" style="color: #94A3B8; text-decoration: underline;">Unsubscribe</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #94A3B8; font-family: Arial, Helvetica, sans-serif;">
                &copy; 2026 YouthAtlas. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Inner card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, html };
}

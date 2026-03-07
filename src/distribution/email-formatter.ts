import type { Opportunity, OpportunityType } from '@/types/opportunity.js';
import { EMAIL_DIGEST } from '@/config/constants.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<OpportunityType, string> = {
  scholarship: '🎓',
  fellowship: '🔬',
  grant: '💰',
  internship: '💼',
  conference: '🎤',
  competition: '🏆',
  training: '📚',
  job: '💼',
};

const BASE_URL = 'https://youthatlas.vercel.app';

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

// ── Opportunity row ────────────────────────────────────────────────────────────

function renderOpportunityRow(opp: Opportunity): string {
  const emoji = TYPE_EMOJI[opp.type] ?? '📌';
  const typeLabel = opp.type.charAt(0).toUpperCase() + opp.type.slice(1);
  const title = escapeHtml(opp.title);
  const org = opp.organization ? escapeHtml(opp.organization) : '';
  const deadline = escapeHtml(formatDeadline(opp.deadline, opp.is_rolling));
  const url = `${BASE_URL}/opportunities/${opp.slug}`;

  const rawSummary = opp.summary || opp.description;
  const summary = rawSummary
    ? escapeHtml(truncate(rawSummary, EMAIL_DIGEST.MAX_SUMMARY_LENGTH))
    : '';

  return `
    <tr>
      <td style="padding: 20px 0; border-bottom: 1px solid #e5e7eb;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; line-height: 1.3;">
                <a href="${url}" style="color: #2563eb; text-decoration: none;">${title}</a>
              </h3>
              ${org ? `<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">${org}</p>` : ''}
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #374151;">
                <span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${emoji} ${typeLabel}</span>
                &nbsp;&nbsp;📅 <strong>Deadline:</strong> ${deadline}
                ${opp.is_fully_funded ? '&nbsp;&nbsp;✅ <strong>Fully Funded</strong>' : ''}
              </p>
              ${summary ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #4b5563; line-height: 1.6;">${summary}</p>` : ''}
              <a href="${url}" style="color: #2563eb; font-size: 13px; font-weight: 600; text-decoration: none;">View &amp; Apply →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// ── Public formatter ───────────────────────────────────────────────────────────

/**
 * Format a list of opportunities into a weekly digest email.
 * Returns the email subject and HTML body with inline styles.
 * HTML is kept simple and table-based for maximum email client compatibility.
 */
export function formatWeeklyDigest(
  opportunities: Opportunity[],
): { subject: string; html: string } {
  const count = opportunities.length;
  const subject = `YouthAtlas Weekly: ${count} New Opportunit${count === 1 ? 'y' : 'ies'} This Week`;

  const capped = opportunities.slice(0, EMAIL_DIGEST.MAX_OPPORTUNITIES);
  const rows = capped.map(renderOpportunityRow).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Email card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px;">

          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 28px 32px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                Youth<span style="color: #60a5fa;">Atlas</span>
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; font-weight: 400;">
                Your weekly opportunity digest
              </p>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 24px 32px 4px 32px;">
              <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6;">
                Here are the top opportunities added this week:
              </p>
            </td>
          </tr>

          <!-- Opportunities list -->
          <tr>
            <td style="padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 24px 32px;" align="center">
              <a href="${BASE_URL}/opportunities"
                 style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 6px;">
                Browse All Opportunities →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px 28px 32px; border-top: 1px solid #e5e7eb; background-color: #f8fafc; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.6;">
                You received this because you subscribed at
                <a href="${BASE_URL}" style="color: #6b7280; text-decoration: none;">youthatlas.com</a>.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                <a href="{{ unsubscribe_url }}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, html };
}

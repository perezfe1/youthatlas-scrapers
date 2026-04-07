import type { Opportunity } from '@/types/opportunity.js';
import type { DigestUser } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoDate: string): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
  const d = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00Z` : isoDate);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const TYPE_COLORS: Record<string, string> = {
  scholarship: '#2563EB',
  fellowship:  '#7C3AED',
  internship:  '#16A34A',
  grant:       '#EA580C',
  conference:  '#0D9488',
  competition: '#DC2626',
  training:    '#D97706',
};

const DEFAULT_BADGE_COLOR = '#6B7280';

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(opp: Opportunity): string {
  const badgeColor = TYPE_COLORS[opp.type] ?? DEFAULT_BADGE_COLOR;
  const detailUrl = `https://youthatlas.com/opportunities/${htmlEscape(opp.slug)}`;
  const deadline = opp.deadline
    ? `Deadline: ${formatDate(opp.deadline)}`
    : opp.is_rolling ? 'Rolling deadline' : '';

  const summary = opp.summary
    ? htmlEscape(opp.summary.length > 150 ? opp.summary.slice(0, 150) + '...' : opp.summary)
    : '';

  const orgLine = opp.organization
    ? `<p style="margin:0 0 6px;color:#6B7280;font-size:13px;">${htmlEscape(opp.organization)}</p>`
    : '';

  const regionLine = opp.regions.length > 0
    ? `<p style="margin:0 0 6px;color:#6B7280;font-size:12px;">${htmlEscape(opp.regions.map(r => r.replace(/_/g, ' ')).join(', '))}</p>`
    : '';

  const fundedBadge = opp.is_fully_funded
    ? `<span style="display:inline-block;background-color:#059669;color:#FFF;font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;margin-left:6px;">Fully Funded</span>`
    : '';

  return `
    <div style="border:1px solid #E5E7EB;border-radius:10px;padding:18px;margin-bottom:14px;background-color:#FFFBF5;">
      <div style="margin-bottom:6px;">
        <span style="display:inline-block;background-color:${badgeColor};color:#FFF;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;text-transform:capitalize;">${htmlEscape(opp.type)}</span>${fundedBadge}
      </div>
      <h2 style="margin:4px 0 4px;font-size:15px;font-weight:700;line-height:1.4;">
        <a href="${detailUrl}" style="color:#111827;text-decoration:none;">${htmlEscape(opp.title)}</a>
      </h2>
      ${orgLine}
      ${regionLine}
      ${deadline ? `<p style="margin:0 0 6px;color:#9CA3AF;font-size:12px;">${htmlEscape(deadline)}</p>` : ''}
      ${summary ? `<p style="margin:0 0 12px;color:#4B5563;font-size:13px;line-height:1.5;">${summary}</p>` : ''}
      <a href="${detailUrl}"
         style="display:inline-block;background-color:#1E40AF;color:#FFF;font-size:13px;font-weight:600;padding:8px 16px;border-radius:6px;text-decoration:none;">
        View &amp; Apply &#8594;
      </a>
    </div>`.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function formatPersonalizedDigest(
  user: DigestUser,
  opportunities: Opportunity[],
  isPersonalized: boolean,
): { subject: string; html: string } {
  const subject = isPersonalized
    ? 'Your Weekly Opportunities \u2014 YouthAtlas'
    : 'This Week on YouthAtlas \u2014 Top Opportunities';

  const greeting = user.display_name
    ? `Hi ${htmlEscape(user.display_name)},`
    : 'Hi there,';

  const introText = isPersonalized
    ? `Here are <strong>${opportunities.length} opportunities</strong> matching your interests this week.`
    : `Here are this week&#8217;s <strong>top ${opportunities.length} opportunities</strong> on YouthAtlas.`;

  const prefsNote = isPersonalized
    ? `<p style="margin:0 0 16px;color:#6B7280;font-size:12px;font-style:italic;">Based on your preferences. <a href="https://youthatlas.com/dashboard" style="color:#1E40AF;text-decoration:underline;">Update them here</a>.</p>`
    : '';

  const cards = opportunities.map(buildCard).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Weekly Digest — YouthAtlas</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:Inter,system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="background-color:#FFFBF5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"
               style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#1E40AF;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#FFF;font-size:22px;font-weight:700;letter-spacing:-0.3px;">YouthAtlas</p>
              <p style="margin:6px 0 0;color:#BFDBFE;font-size:14px;">Weekly Digest</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#FFF;padding:28px 32px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">
              <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${introText}</p>
              ${prefsNote}
              ${cards}
              <div style="text-align:center;margin-top:20px;">
                <a href="https://youthatlas.com/opportunities"
                   style="display:inline-block;background-color:#3B82F6;color:#FFF;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
                  Browse All Opportunities
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB;border-radius:0 0 12px 12px;padding:20px 32px;
                       text-align:center;border:1px solid #E5E7EB;border-top:none;">
              <p style="margin:0;color:#6B7280;font-size:12px;line-height:1.7;">
                You&#8217;re receiving this because you have a YouthAtlas account.<br>
                <a href="https://youthatlas.com/dashboard"
                   style="color:#1E40AF;text-decoration:underline;">Manage your preferences</a>
              </p>
              <p style="margin:10px 0 0;color:#9CA3AF;font-size:11px;">
                <a href="https://youthatlas.com/api/reminders/unsubscribe?token=${htmlEscape(user.id)}"
                   style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from digest emails</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

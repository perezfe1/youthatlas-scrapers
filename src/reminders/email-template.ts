import type { UserReminder, ReminderOpportunity } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format ISO date string as "Mar 11, 2026" using UTC components. */
function formatDate(isoDate: string): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
  // Use noon UTC to avoid any timezone-edge-case off-by-one on the date
  const d = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00Z` : isoDate);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Map opportunity type → badge background color. */
const TYPE_COLORS: Record<string, string> = {
  scholarship: '#2563EB',   // blue-600
  fellowship:  '#7C3AED',   // violet-600
  internship:  '#16A34A',   // green-600
  grant:       '#EA580C',   // orange-600
  conference:  '#0D9488',   // teal-600
  job:         '#4F46E5',   // indigo-600
  competition: '#DC2626',   // red-600
  training:    '#D97706',   // amber-600
};

const DEFAULT_BADGE_COLOR = '#6B7280'; // gray-500

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(opp: ReminderOpportunity): string {
  const badgeColor = TYPE_COLORS[opp.type] ?? DEFAULT_BADGE_COLOR;
  const ctaUrl = htmlEscape(opp.applyUrl ?? opp.sourceUrl);
  const detailUrl = `https://youthatlas.com/opportunities/${htmlEscape(opp.slug)}`;
  const formattedDeadline = formatDate(opp.deadline);

  const orgLine = opp.organization
    ? `<p style="margin:0 0 14px;color:#6B7280;font-size:13px;line-height:1.4;">${htmlEscape(opp.organization)}</p>`
    : `<div style="margin-bottom:14px;"></div>`;

  return `
    <div style="border:1px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:16px;background-color:#FFFBF5;">
      <div style="margin-bottom:8px;">
        <span style="display:inline-block;background-color:${badgeColor};color:#FFFFFF;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;text-transform:capitalize;letter-spacing:0.3px;">${htmlEscape(opp.type)}</span>
      </div>
      <p style="margin:0 0 2px;color:#EF4444;font-size:12px;font-weight:600;">⏰ Closes ${htmlEscape(formattedDeadline)}</p>
      <h2 style="margin:4px 0 4px;font-size:15px;font-weight:700;line-height:1.4;">
        <a href="${detailUrl}" style="color:#111827;text-decoration:none;">${htmlEscape(opp.title)}</a>
      </h2>
      ${orgLine}
      <a href="${ctaUrl}"
         style="display:inline-block;background-color:#1E40AF;color:#FFFFFF;font-size:13px;font-weight:600;padding:9px 18px;border-radius:6px;text-decoration:none;">
        Apply Now &#8594;
      </a>
    </div>`.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function formatReminderEmail(
  reminder: UserReminder,
  unsubscribeToken?: string,
): { subject: string; html: string } {
  const n = reminder.opportunities.length;
  const subject = `⏰ ${n} opportunit${n === 1 ? 'y' : 'ies'} closing in 3 days`;

  const cards = reminder.opportunities.map(buildCard).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Deadline Reminder — YouthAtlas</title>
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
              <p style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:-0.3px;">YouthAtlas</p>
              <p style="margin:6px 0 0;color:#BFDBFE;font-size:14px;">Deadline Reminder</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#FFFFFF;padding:28px 32px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                You have <strong>${n} opportunit${n === 1 ? 'y' : 'ies'}</strong> closing in
                <strong>3 days</strong>. Don&#8217;t miss your chance to apply!
              </p>
              ${cards}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB;border-radius:0 0 12px 12px;padding:20px 32px;
                       text-align:center;border:1px solid #E5E7EB;border-top:none;">
              <p style="margin:0;color:#6B7280;font-size:12px;line-height:1.7;">
                You&#8217;re receiving this because you saved opportunities on YouthAtlas.<br>
                <a href="https://youthatlas.com/dashboard"
                   style="color:#1E40AF;text-decoration:underline;">Manage your saved opportunities</a>
              </p>${unsubscribeToken ? `
              <p style="margin:10px 0 0;color:#9CA3AF;font-size:11px;">
                <a href="https://youthatlas.com/api/reminders/unsubscribe?token=${htmlEscape(unsubscribeToken)}"
                   style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from deadline reminders</a>
              </p>` : ''}
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

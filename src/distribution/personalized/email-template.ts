import type { Opportunity } from '@/types/opportunity.js';
import type { DigestUser, TrendingOpportunity } from './types.js';

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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

const UTM = 'utm_source=digest&utm_medium=email&utm_campaign=weekly';

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(opp: Opportunity, matchReasons: string[] = []): string {
  const badgeColor = TYPE_COLORS[opp.type] ?? DEFAULT_BADGE_COLOR;
  const detailUrl = `https://youthatlas.com/opportunities/${htmlEscape(opp.slug)}?${UTM}`;
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

  const matchTag = matchReasons.length > 0
    ? `<p style="margin:0 0 10px;font-size:11px;color:#6B7280;">Matches: ${
        matchReasons.map(r =>
          `<span style="background:#EFF6FF;color:#1D4ED8;padding:1px 6px;border-radius:3px;margin-right:3px;display:inline-block;">${htmlEscape(r)}</span>`
        ).join('')
      }</p>`
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
      ${matchTag}
      <a href="${detailUrl}"
         style="display:inline-block;background-color:#1E40AF;color:#FFF;font-size:13px;font-weight:600;padding:8px 16px;border-radius:6px;text-decoration:none;">
        View &amp; Apply &#8594;
      </a>
    </div>`.trim();
}

// ── Closing Soon section ──────────────────────────────────────────────────────

function buildClosingSoonSection(opps: Opportunity[]): string {
  if (opps.length === 0) return '';
  const cards = opps.slice(0, 3).map(o => buildCard(o, ['Closing Soon'])).join('\n');
  return `
    <div style="margin-bottom:20px;">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#DC2626;letter-spacing:0.3px;">
        ⏰ CLOSING THIS WEEK
      </h3>
      ${cards}
    </div>
    <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 20px;" />
  `.trim();
}

// ── Trending section ─────────────────────────────────────────────────────────

function buildTrendingSection(trending: TrendingOpportunity[]): string {
  if (trending.length === 0) return '';
  const cards = trending.map(({ opportunity: opp, save_count }) => {
    const detailUrl = `https://youthatlas.com/opportunities/${htmlEscape(opp.slug)}?${UTM}`;
    const saveBadge = `<span style="display:inline-block;background:#FEF3C7;color:#92400E;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;margin-bottom:8px;">🔥 ${save_count} saves this week</span>`;
    const orgLine = opp.organization
      ? `<p style="margin:0 0 6px;color:#6B7280;font-size:13px;">${htmlEscape(opp.organization)}</p>`
      : '';
    const deadlineLine = opp.deadline
      ? `<p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;">Deadline: ${formatDate(opp.deadline)}</p>`
      : '';
    return `
      <div style="border:1px solid #FDE68A;border-radius:10px;padding:18px;margin-bottom:14px;background-color:#FFFBF5;">
        ${saveBadge}
        <h2 style="margin:4px 0 4px;font-size:15px;font-weight:700;line-height:1.4;">
          <a href="${detailUrl}" style="color:#111827;text-decoration:none;">${htmlEscape(opp.title)}</a>
        </h2>
        ${orgLine}
        ${deadlineLine}
        <a href="${detailUrl}"
           style="display:inline-block;background-color:#D97706;color:#FFF;font-size:13px;font-weight:600;padding:8px 16px;border-radius:6px;text-decoration:none;">
          View &amp; Apply &#8594;
        </a>
      </div>`.trim();
  }).join('\n');

  return `
    <div style="margin-bottom:20px;">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#92400E;letter-spacing:0.3px;">
        🔥 TRENDING THIS WEEK
      </h3>
      ${cards}
    </div>
    <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 20px;" />
  `.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function formatPersonalizedDigest(
  user: DigestUser,
  opportunities: Opportunity[],
  isPersonalized: boolean,
  closingSoonOpps: Opportunity[] = [],
  trendingOpps: TrendingOpportunity[] = [],
): { subject: string; html: string } {

  // ── Subject line ───────────────────────────────────────────────────────────
  let subject: string;
  if (!isPersonalized) {
    subject = `This Week on YouthAtlas \u2014 Top ${opportunities.length} Opportunities`;
  } else {
    const typeCounts = new Map<string, number>();
    for (const o of opportunities) {
      typeCounts.set(o.type, (typeCounts.get(o.type) ?? 0) + 1);
    }
    const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const regionLabel = user.regions_of_interest[0]
      ? ` in ${user.regions_of_interest[0].replace(/_/g, ' ')}`
      : '';
    const typeLabel = typeCounts.size === 1 && topType
      ? ` ${capitalize(topType)}${opportunities.length !== 1 ? 's' : ''}`
      : ' Opportunities';
    subject = `${opportunities.length} new${typeLabel}${regionLabel} for you \u2014 YouthAtlas`;
  }

  // ── Match reasons + cards ─────────────────────────────────────────────────
  const typeSet = new Set(user.types_of_interest);
  const regionSet = new Set(user.regions_of_interest);

  const cards = opportunities.map((opp) => {
    if (!isPersonalized) return buildCard(opp);
    const reasons: string[] = [];
    if (typeSet.has(opp.type)) {
      reasons.push(capitalize(opp.type));
    }
    const matchedRegions = opp.regions.filter(r => regionSet.has(r));
    for (const r of matchedRegions.slice(0, 2)) {
      reasons.push(r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    }
    return buildCard(opp, reasons);
  }).join('\n');

  // ── Closing soon section (filtered to matched opps only) ──────────────────
  const matchedClosingSoon = closingSoonOpps.filter(opp => {
    if (typeSet.has(opp.type)) return true;
    if (opp.regions.some(r => regionSet.has(r))) return true;
    return false;
  });
  const closingSoonSection = buildClosingSoonSection(matchedClosingSoon);
  const trendingSection = buildTrendingSection(trendingOpps);

  // ── Email body ────────────────────────────────────────────────────────────
  const greeting = user.display_name
    ? `Hi ${htmlEscape(user.display_name)},`
    : 'Hi there,';

  const introText = isPersonalized
    ? `Here are <strong>${opportunities.length} opportunities</strong> matching your interests this week.`
    : `Here are this week&#8217;s <strong>top ${opportunities.length} opportunities</strong> on YouthAtlas.`;

  const prefsNote = isPersonalized
    ? `<p style="margin:0 0 16px;color:#6B7280;font-size:12px;font-style:italic;">Based on your preferences. <a href="https://youthatlas.com/dashboard" style="color:#1E40AF;text-decoration:underline;">Update them here</a>.</p>`
    : '';

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
              ${closingSoonSection}
              ${trendingSection}
              ${cards}
              <div style="text-align:center;margin-top:20px;">
                <a href="https://youthatlas.com/opportunities?${UTM}"
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

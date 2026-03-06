import type { Opportunity, OpportunityType } from '@/types/opportunity.js';
import { DISTRIBUTION, TELEGRAM } from '@/config/constants.js';

// ── Emoji map ─────────────────────────────────────────────────────────────────

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

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Escape special HTML characters for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDeadline(deadline: string | null, isRolling: boolean): string {
  if (isRolling || !deadline) return 'Rolling';
  const date = new Date(deadline);
  // Use UTC to avoid timezone shifts on date-only strings (e.g. "2026-01-15")
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatRegions(regions: string[]): string {
  return regions
    .map((r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(', ');
}

// ── Public formatters ─────────────────────────────────────────────────────────

/**
 * Format a single opportunity as a Telegram HTML message.
 * Keeps output under TELEGRAM.MAX_MESSAGE_LENGTH (4096 chars).
 */
export function formatOpportunityPost(opportunity: Opportunity): string {
  const emoji = TYPE_EMOJI[opportunity.type] ?? '📌';
  const title = escapeHtml(opportunity.title);
  const deadline = formatDeadline(opportunity.deadline, opportunity.is_rolling);
  const applyUrl = `https://youthatlas.vercel.app/opportunities/${opportunity.slug}`;

  // Truncate summary to MAX_SUMMARY_LENGTH before escaping (escape may expand length slightly)
  let summary = '';
  if (opportunity.summary) {
    const raw = opportunity.summary;
    const truncated = raw.length > DISTRIBUTION.MAX_SUMMARY_LENGTH
      ? `${raw.slice(0, DISTRIBUTION.MAX_SUMMARY_LENGTH)}...`
      : raw;
    summary = escapeHtml(truncated);
  }

  const lines: string[] = [];

  // Title line
  lines.push(`${emoji} <b>${title}</b>`);
  lines.push('');

  // Metadata lines
  if (opportunity.organization) {
    lines.push(`🏢 ${escapeHtml(opportunity.organization)}`);
  }
  lines.push(`📅 Deadline: ${deadline}`);
  if (opportunity.regions.length > 0) {
    lines.push(`🌍 ${formatRegions(opportunity.regions)}`);
  }
  if (opportunity.is_fully_funded) {
    lines.push('✅ Fully Funded');
  }

  // Summary
  if (summary) {
    lines.push('');
    lines.push(summary);
  }

  // Apply link
  lines.push('');
  lines.push(`<a href="${applyUrl}">View &amp; Apply →</a>`);

  const msg = lines.join('\n');

  // Safety trim: if message still exceeds the hard limit, shorten the summary further
  if (msg.length <= TELEGRAM.MAX_MESSAGE_LENGTH) {
    return msg;
  }

  const overhead = msg.length - summary.length;
  const maxSummaryLen = Math.max(0, TELEGRAM.MAX_MESSAGE_LENGTH - overhead - 3);
  const trimmedSummary = summary.slice(0, maxSummaryLen) + '...';
  return lines
    .map((l) => (l === summary ? trimmedSummary : l))
    .join('\n');
}

/**
 * Format the digest header message sent before individual opportunity posts.
 */
export function formatDigestHeader(count: number): string {
  return `📢 <b>${count} New Opportunities</b>\n\nHere are the latest opportunities added to YouthAtlas:`;
}

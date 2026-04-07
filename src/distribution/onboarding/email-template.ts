// ── Types ─────────────────────────────────────────────────────────────────────

export type OnboardingUser = {
  id: string;
  email: string;
  display_name: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Button config ─────────────────────────────────────────────────────────────

const BUTTONS = [
  { type: 'scholarship', label: 'Scholarships', color: '#2563EB', emoji: '🎓' },
  { type: 'fellowship',  label: 'Fellowships',  color: '#7C3AED', emoji: '🔬' },
  { type: 'grant',       label: 'Grants',        color: '#EA580C', emoji: '💰' },
  { type: 'internship',  label: 'Internships',   color: '#D97706', emoji: '💼' },
] as const;

// ── Public API ────────────────────────────────────────────────────────────────

export function formatOnboardingEmail(
  user: OnboardingUser,
): { subject: string; html: string } {
  const subject = 'What kind of opportunities are you looking for? 🎯';
  const greeting = user.display_name
    ? `Hi ${htmlEscape(user.display_name)},`
    : 'Hi there,';

  const baseUrl = 'https://youthatlas.com/api/preferences/quick-set';

  const buttons = BUTTONS.map(({ type, label, color, emoji }) =>
    `<a href="${baseUrl}?type=${type}&userId=${htmlEscape(user.id)}"
        style="display:inline-block;background-color:${color};color:#FFF;
               font-size:15px;font-weight:700;padding:14px 22px;border-radius:10px;
               text-decoration:none;margin:6px;white-space:nowrap;">
       ${emoji}&nbsp;${label}
     </a>`,
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Welcome to YouthAtlas</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:Inter,system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="background-color:#FFFBF5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"
               style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#1E40AF;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#FFF;font-size:22px;font-weight:700;letter-spacing:-0.3px;">YouthAtlas</p>
              <p style="margin:6px 0 0;color:#BFDBFE;font-size:14px;">Welcome aboard 🎉</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#FFF;padding:32px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;font-weight:600;">${greeting}</p>
              <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
                Welcome to YouthAtlas! We track <strong>800+ scholarships, fellowships, grants, and more</strong> — updated every day.
              </p>
              <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
                Tell us what you're looking for and we'll send you a <strong>personalized weekly digest</strong> with opportunities matched to your interests:
              </p>

              <!-- Buttons -->
              <div style="text-align:center;margin-bottom:28px;">
                ${buttons}
              </div>

              <p style="margin:0;color:#6B7280;font-size:13px;text-align:center;line-height:1.6;">
                Want to set regions, multiple types, or keywords?<br>
                <a href="https://youthatlas.com/dashboard" style="color:#1E40AF;text-decoration:underline;font-weight:500;">
                  Set your full preferences on the dashboard →
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB;border-radius:0 0 12px 12px;padding:18px 32px;
                       text-align:center;border:1px solid #E5E7EB;border-top:none;">
              <p style="margin:0;color:#9CA3AF;font-size:11px;line-height:1.7;">
                You received this because you created a YouthAtlas account.<br>
                <a href="https://youthatlas.com/api/reminders/unsubscribe?token=${htmlEscape(user.id)}"
                   style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from emails</a>
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

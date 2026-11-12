/**
 * The notification email: one per student per run, listing what needs them.
 * Table-based HTML with inline styles so it renders in Gmail and Outlook,
 * plus a plain-text part.
 */

export type DigestEntry = { title: string; body: string; href: string | null };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function digestSubject(entries: DigestEntry[]) {
  if (entries.length === 1) return entries[0].title;
  return `${entries.length} updates on BorrowBuddy`;
}

export function renderDigest({
  firstName,
  entries,
  appUrl,
}: {
  firstName: string;
  entries: DigestEntry[];
  appUrl: string;
}): { html: string; text: string } {
  const settingsUrl = `${appUrl}/me#email`;
  const rows = entries
    .map((entry) => {
      const url = entry.href ? `${appUrl}${entry.href}` : `${appUrl}/notifications`;
      return `
        <tr>
          <td style="padding:14px 0;border-top:1px solid #e3e3e3;">
            <a href="${escapeHtml(url)}" style="color:#000000;text-decoration:none;">
              <div style="font:700 14px/1.35 Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:.02em;">${escapeHtml(entry.title)}</div>
              ${entry.body ? `<div style="font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#3d3d3d;margin-top:4px;">${escapeHtml(entry.body)}</div>` : ""}
              <div style="font:700 12px/1.4 Arial,Helvetica,sans-serif;color:#003993;margin-top:6px;">Open &rarr;</div>
            </a>
          </td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BorrowBuddy</title></head>
  <body style="margin:0;padding:0;background:#f0f0f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;">
          <tr><td style="background:#003993;padding:18px 24px;">
            <span style="font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:.14em;color:#ffffff;">BORROWBUDDY</span>
            <span style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.1em;color:#cb840e;float:right;">[ CAMPUS CARGO ]</span>
          </td></tr>
          <tr><td style="padding:24px 24px 8px;">
            <div style="font:700 20px/1.3 Arial,Helvetica,sans-serif;color:#000000;">Hi ${escapeHtml(firstName)}, here's what needs you.</div>
          </td></tr>
          <tr><td style="padding:0 24px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          </td></tr>
          <tr><td style="padding:8px 24px 28px;">
            <a href="${escapeHtml(`${appUrl}/notifications`)}" style="display:inline-block;background:#cb840e;color:#ffffff;font:700 13px/1 Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:.04em;padding:12px 18px;text-decoration:none;">See all notifications</a>
          </td></tr>
          <tr><td style="padding:16px 24px;background:#f7f7f7;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#6b6b6b;">
            You get these emails for requests, due dates, extensions and fines you haven't seen in the app yet.
            <a href="${escapeHtml(settingsUrl)}" style="color:#003993;">Turn off email updates</a>.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${firstName}, here's what needs you on BorrowBuddy:`,
    "",
    ...entries.flatMap((entry) => [
      `- ${entry.title}`,
      ...(entry.body ? [`  ${entry.body}`] : []),
      `  ${entry.href ? `${appUrl}${entry.href}` : `${appUrl}/notifications`}`,
      "",
    ]),
    `All notifications: ${appUrl}/notifications`,
    `Turn off email updates: ${settingsUrl}`,
  ].join("\n");

  return { html, text };
}

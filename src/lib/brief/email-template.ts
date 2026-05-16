import type { BriefData } from './generate';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://inboxgpt.stricklandai.com';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#dc2626';
    case 'high': return '#ea580c';
    case 'normal': return '#6b7280';
    case 'low': return '#9ca3af';
    default: return '#6b7280';
  }
}

function renderItem(fromName: string, subject: string, summary: string, borderColor: string): string {
  return `
    <tr><td style="padding:12px 16px;border-left:4px solid ${borderColor};background:#fafafa;margin-bottom:8px;">
      <div style="font-weight:600;font-size:14px;color:#111;">${escapeHtml(fromName)}</div>
      <div style="font-size:13px;color:#374151;margin-top:2px;">${escapeHtml(subject)}</div>
      ${summary ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(summary)}</div>` : ''}
    </td></tr>
    <tr><td style="height:8px;"></td></tr>
  `;
}

export function renderBriefEmail(data: BriefData): { html: string; text: string; subject: string } {
  const isPro = data.plan === 'pro';
  const subject = `Your Morning Brief — ${data.stats.newEmails} new email${data.stats.newEmails !== 1 ? 's' : ''}`;

  // Stats line
  const statsParts: string[] = [];
  statsParts.push(`${data.stats.newEmails} new email${data.stats.newEmails !== 1 ? 's' : ''}`);
  if (data.stats.needsReply > 0) statsParts.push(`${data.stats.needsReply} need${data.stats.needsReply !== 1 ? '' : 's'} your reply`);
  if (data.stats.staleFollowUps > 0) statsParts.push(`${data.stats.staleFollowUps} follow-up${data.stats.staleFollowUps !== 1 ? 's' : ''} overdue`);
  const statsLine = statsParts.join(' &middot; ');

  // Priority items
  let priorityHtml = '';
  if (data.priorityItems.length > 0) {
    priorityHtml = `
      <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Priority</td></tr>
      ${data.priorityItems.map((item) =>
        renderItem(item.fromName, item.subject, item.summary, priorityColor(item.priority))
      ).join('')}
    `;
  }

  // Awaiting reply (Pro) or teaser (Free)
  let awaitingHtml = '';
  if (data.stats.needsReply > 0) {
    if (isPro && data.awaitingReply.length > 0) {
      awaitingHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Awaiting Your Reply</td></tr>
        ${data.awaitingReply.map((item) =>
          renderItem(item.fromName, item.subject, `Waiting ${item.hoursSince}h for your response`, '#eab308')
        ).join('')}
      `;
    } else {
      awaitingHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Awaiting Your Reply</td></tr>
        <tr><td style="padding:12px 16px;border-left:4px solid #eab308;background:#fefce8;">
          <div style="font-size:13px;color:#854d0e;">${data.stats.needsReply} email${data.stats.needsReply !== 1 ? 's are' : ' is'} waiting on you</div>
          <a href="${BASE_URL}/pricing" style="font-size:12px;color:#7c3aed;text-decoration:underline;margin-top:4px;display:inline-block;">Upgrade to Pro to see them</a>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
      `;
    }
  }

  // Follow-ups (Pro) or teaser (Free)
  let followUpHtml = '';
  if (data.stats.staleFollowUps > 0) {
    if (isPro && data.followUps.length > 0) {
      followUpHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Follow-Up Reminders</td></tr>
        ${data.followUps.map((item) =>
          renderItem(item.recipientName, item.subject, `Sent ${item.daysSince} days ago — no reply`, '#3b82f6')
        ).join('')}
      `;
    } else {
      followUpHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Follow-Up Reminders</td></tr>
        <tr><td style="padding:12px 16px;border-left:4px solid #3b82f6;background:#eff6ff;">
          <div style="font-size:13px;color:#1e40af;">${data.stats.staleFollowUps} sent email${data.stats.staleFollowUps !== 1 ? 's' : ''} got no reply</div>
          <a href="${BASE_URL}/pricing" style="font-size:12px;color:#7c3aed;text-decoration:underline;margin-top:4px;display:inline-block;">Upgrade to Pro for follow-up tracking</a>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
      `;
    }
  }

  // Digest
  let digestHtml = '';
  if (data.digest.length > 0) {
    digestHtml = `
      <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Also in your inbox</td></tr>
      ${data.digest.map((item) => `
        <tr><td style="padding:6px 16px;">
          <span style="font-weight:600;font-size:13px;color:#374151;">${escapeHtml(item.fromName)}</span>
          <span style="font-size:13px;color:#6b7280;"> — ${escapeHtml(item.subject)}</span>
        </td></tr>
      `).join('')}
    `;
  }

  // Footer
  const footerCta = isPro
    ? `<a href="${BASE_URL}/settings" style="color:#6b7280;text-decoration:underline;">Manage brief settings</a>`
    : `<a href="${BASE_URL}/pricing" style="color:#7c3aed;font-weight:600;text-decoration:underline;">Upgrade to Pro for full brief</a>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1e293b;padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="color:#ffffff;font-size:18px;font-weight:700;">InboxGPT</span></td>
              <td align="right"><span style="color:#94a3b8;font-size:13px;">Your Morning Brief</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Greeting + Stats -->
        <tr><td style="padding:24px 24px 8px;">
          <div style="font-size:16px;color:#111;font-weight:600;">Good morning${data.userName ? ', ' + escapeHtml(data.userName) : ''}.</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">${data.date} &middot; ${statsLine}</div>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:0 24px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${priorityHtml}
            ${awaitingHtml}
            ${followUpHtml}
            ${digestHtml}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 24px 24px;" align="center">
          <a href="${BASE_URL}/inbox" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">Open InboxGPT</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">
            ${footerCta}
            <span style="margin:0 8px;">|</span>
            <a href="${BASE_URL}/settings" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Plain-text fallback
  const textLines = [
    `Good morning${data.userName ? ', ' + data.userName : ''}.`,
    `${data.date} — ${statsParts.join(' · ')}`,
    '',
    '--- PRIORITY ---',
    ...data.priorityItems.map((i) => `• ${i.fromName}: ${i.subject}\n  ${i.summary}`),
    '',
  ];
  if (isPro && data.awaitingReply.length > 0) {
    textLines.push('--- AWAITING YOUR REPLY ---');
    data.awaitingReply.forEach((i) => textLines.push(`• ${i.fromName}: ${i.subject} (${i.hoursSince}h ago)`));
    textLines.push('');
  }
  if (isPro && data.followUps.length > 0) {
    textLines.push('--- FOLLOW-UP REMINDERS ---');
    data.followUps.forEach((i) => textLines.push(`• To ${i.recipientName}: ${i.subject} (${i.daysSince}d ago)`));
    textLines.push('');
  }
  textLines.push(`Open InboxGPT: ${BASE_URL}/inbox`);

  return { html, text: textLines.join('\n'), subject };
}

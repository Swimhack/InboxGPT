import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.BRIEF_SMTP_HOST;
  const port = parseInt(process.env.BRIEF_SMTP_PORT || '465', 10);
  const user = process.env.BRIEF_SMTP_USER;
  const pass = process.env.BRIEF_SMTP_PASS;

  if (!host || !user || !pass) {
    console.log('[Brief] SMTP not configured — briefs will be logged only');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendBriefEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const transport = getTransporter();
  const fromEmail = process.env.BRIEF_FROM_EMAIL || 'brief@inboxgpt.stricklandai.com';
  const fromName = process.env.BRIEF_FROM_NAME || 'InboxGPT';

  if (!transport) {
    console.log(`[Brief] Would send to ${opts.to}: "${opts.subject}" (SMTP not configured)`);
    console.log(`[Brief] Preview:\n${opts.text.slice(0, 500)}`);
    return true; // Don't block — just log
  }

  try {
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[Brief] Sent to ${opts.to}`);
    return true;
  } catch (error) {
    console.error(`[Brief] Failed to send to ${opts.to}:`, error);
    return false;
  }
}

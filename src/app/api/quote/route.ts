import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import nodemailer from 'nodemailer';

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  company: z.string().max(200).optional(),
  service: z.string().min(1).max(200),
  budget: z.string().min(1).max(100),
  description: z.string().min(10).max(5000),
});

async function sendNotificationEmail(lead: z.infer<typeof bodySchema>) {
  const host = process.env.NOTIFICATION_SMTP_HOST;
  if (!host) return; // graceful no-op if SMTP not configured

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.NOTIFICATION_SMTP_PORT || 587),
    secure: process.env.NOTIFICATION_SMTP_SECURE === 'true',
    auth: {
      user: process.env.NOTIFICATION_SMTP_USER,
      pass: process.env.NOTIFICATION_SMTP_PASS,
    },
  });

  const to = process.env.NOTIFICATION_EMAIL_TO || 'james@strickland.tech';
  const from = process.env.NOTIFICATION_EMAIL_FROM || `"InboxGPT" <noreply@inboxgpt.io>`;

  await transporter.sendMail({
    from,
    to,
    subject: `New quote request from ${lead.name} (${lead.company || lead.email})`,
    text: [
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Company: ${lead.company || '—'}`,
      `Service: ${lead.service}`,
      `Budget: ${lead.budget}`,
      '',
      lead.description,
    ].join('\n'),
    html: `
      <h2>New quote request</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><th align="left">Name</th><td>${lead.name}</td></tr>
        <tr><th align="left">Email</th><td><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
        <tr><th align="left">Company</th><td>${lead.company || '—'}</td></tr>
        <tr><th align="left">Service</th><td>${lead.service}</td></tr>
        <tr><th align="left">Budget</th><td>${lead.budget}</td></tr>
      </table>
      <h3>Description</h3>
      <p style="white-space:pre-wrap">${lead.description}</p>
    `,
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const lead = parsed.data;

  await db.insert(schema.quoteLeads).values({
    name: lead.name,
    email: lead.email,
    company: lead.company ?? null,
    service: lead.service,
    budget: lead.budget,
    description: lead.description,
  });

  // Fire-and-forget — don't let email failure block the 200 response
  sendNotificationEmail(lead).catch((err) => {
    console.error('[quote] notification email failed', err);
  });

  return NextResponse.json({ ok: true });
}

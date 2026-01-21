import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { createSmtpClient } from '@/lib/email/smtp-client';
import { generateId } from '@/lib/utils';
import { z } from 'zod';

const sendEmailSchema = z.object({
  accountId: z.string(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean().optional().default(false),
  replyTo: z.string().optional(),
  inReplyTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = sendEmailSchema.parse(body);

    // Get account
    const account = await db.query.emailAccounts.findFirst({
      where: and(
        eq(schema.emailAccounts.id, data.accountId),
        eq(schema.emailAccounts.userId, session.user.id)
      ),
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Create SMTP client and send email
    const smtpClient = await createSmtpClient(account);

    try {
      const result = await smtpClient.sendEmail({
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        text: data.isHtml ? undefined : data.body,
        html: data.isHtml ? data.body : undefined,
        replyTo: data.replyTo,
        inReplyTo: data.inReplyTo,
      });

      // Save to sent folder
      const emailId = generateId();
      const toAddresses = Array.isArray(data.to) ? data.to : [data.to];

      await db.insert(schema.emails).values({
        id: emailId,
        accountId: account.id,
        userId: session.user.id,
        messageId: result.messageId,
        subject: data.subject,
        fromAddress: account.email,
        fromName: account.displayName,
        toAddresses: JSON.stringify(toAddresses.map((addr) => ({ address: addr }))),
        ccAddresses: data.cc
          ? JSON.stringify(
              (Array.isArray(data.cc) ? data.cc : [data.cc]).map((addr) => ({ address: addr }))
            )
          : null,
        sentAt: new Date(),
        receivedAt: new Date(),
        bodyText: data.isHtml ? undefined : data.body,
        bodyHtml: data.isHtml ? data.body : undefined,
        snippet: data.body.slice(0, 200),
        isRead: true,
        isSent: true,
        folder: 'sent',
      });

      return NextResponse.json({ success: true, messageId: result.messageId, emailId });
    } finally {
      await smtpClient.close();
    }
  } catch (error) {
    console.error('Send email error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}

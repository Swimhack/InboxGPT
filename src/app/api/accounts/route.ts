import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { generateId } from '@/lib/utils';
import { encrypt, encryptCredentials } from '@/lib/crypto/encryption';
import { z } from 'zod';

const addImapAccountSchema = z.object({
  providerType: z.literal('imap'),
  email: z.string().email(),
  password: z.string().min(1),
  imapHost: z.string().min(1),
  imapPort: z.string().transform((v) => parseInt(v, 10)),
  smtpHost: z.string().min(1),
  smtpPort: z.string().transform((v) => parseInt(v, 10)),
  displayName: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await db.query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, session.user.id),
    columns: {
      id: true,
      email: true,
      displayName: true,
      providerType: true,
      lastSyncAt: true,
      syncStatus: true,
      syncError: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = addImapAccountSchema.parse(body);

    // Check if account already exists
    const existing = await db.query.emailAccounts.findFirst({
      where: eq(schema.emailAccounts.email, data.email),
    });

    if (existing) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 400 });
    }

    // Encrypt sensitive data
    const encryptedCredentials = encryptCredentials({
      username: data.email,
      password: data.password,
    });
    const encryptedImapHost = encrypt(data.imapHost);
    const encryptedSmtpHost = encrypt(data.smtpHost);

    const accountId = generateId();

    await db.insert(schema.emailAccounts).values({
      id: accountId,
      userId: session.user.id,
      email: data.email,
      displayName: data.displayName || data.email.split('@')[0],
      providerType: 'imap',
      imapHost: encryptedImapHost,
      imapPort: data.imapPort,
      imapSecure: data.imapPort === 993,
      smtpHost: encryptedSmtpHost,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpPort === 465,
      encryptedCredentials,
      syncStatus: 'idle',
      isActive: true,
    });

    return NextResponse.json({ success: true, accountId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('Failed to add account:', error);
    return NextResponse.json({ error: 'Failed to add account' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('id');

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
  }

  // Verify ownership
  const account = await db.query.emailAccounts.findFirst({
    where: eq(schema.emailAccounts.id, accountId),
  });

  if (!account || account.userId !== session.user.id) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  await db.delete(schema.emailAccounts).where(eq(schema.emailAccounts.id, accountId));

  return NextResponse.json({ success: true });
}

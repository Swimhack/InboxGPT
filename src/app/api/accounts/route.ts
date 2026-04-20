import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { encryptJSON } from '@/lib/crypto/encryption';
import { z } from 'zod';

const addImapAccountSchema = z.object({
  providerType: z.literal('imap').optional(),
  provider: z.literal('imap').optional(),
  email: z.string().email(),
  password: z.string().min(1),
  imapHost: z.string().min(1),
  imapPort: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]),
  smtpHost: z.string().min(1),
  smtpPort: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]),
  displayName: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ accounts: [], byProvider: {} });
  }

  const rows = await db
    .select({
      id: schema.channelAccounts.id,
      externalAccountId: schema.channelAccounts.externalAccountId,
      displayName: schema.channelAccounts.displayName,
      provider: schema.channelAccounts.provider,
      status: schema.channelAccounts.status,
      lastSyncAt: schema.channelAccounts.lastSyncAt,
      lastError: schema.channelAccounts.lastError,
      createdAt: schema.channelAccounts.createdAt,
    })
    .from(schema.channelAccounts)
    .where(eq(schema.channelAccounts.workspaceId, workspace.workspaceId));

  // Add `email` alias for backward compat with compose page + other consumers
  const accounts = rows.map((r) => ({
    ...r,
    email: r.externalAccountId,
  }));

  const { searchParams } = new URL(request.url);
  if (searchParams.get('groupBy') === 'provider') {
    const byProvider: Record<string, typeof accounts> = {};
    for (const row of accounts) {
      (byProvider[row.provider] ||= []).push(row);
    }
    return NextResponse.json({ byProvider });
  }

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const data = addImapAccountSchema.parse(body);
    const imapPort = Number(data.imapPort);
    const smtpPort = Number(data.smtpPort);

    const existing = await db
      .select({ id: schema.channelAccounts.id })
      .from(schema.channelAccounts)
      .where(
        and(
          eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
          eq(schema.channelAccounts.provider, 'imap'),
          eq(schema.channelAccounts.externalAccountId, data.email)
        )
      );

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 400 });
    }

    const credentialsEncrypted = encryptJSON({
      username: data.email,
      password: data.password,
      imapHost: data.imapHost,
      imapPort,
      imapSecure: imapPort === 993,
      smtpHost: data.smtpHost,
      smtpPort,
      smtpSecure: smtpPort === 465,
    });

    const [inserted] = await db
      .insert(schema.channelAccounts)
      .values({
        workspaceId: workspace.workspaceId,
        userId: session.user.id as string,
        provider: 'imap',
        externalAccountId: data.email,
        displayName: data.displayName || data.email,
        status: 'active',
        credentialsEncrypted,
      })
      .returning({ id: schema.channelAccounts.id });

    return NextResponse.json({ success: true, accountId: inserted.id });
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
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('id');

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
  }

  await db
    .delete(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.id, accountId),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId)
      )
    );

  return NextResponse.json({ success: true });
}

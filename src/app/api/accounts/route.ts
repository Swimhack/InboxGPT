import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { withWorkspace, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { encryptJSON } from '@/lib/crypto/encryption';
import type { ImapCredentials } from '@/lib/crypto/encryption';
import { z } from 'zod';
import { canAddChannel, isAdmin } from '@/lib/stripe/plans';

const addImapAccountSchema = z.object({
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
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  const { accounts, ws } = await withWorkspace(workspace.workspaceId, async (tx) => {
    const accounts = await tx.query.channelAccounts.findMany({
      where: eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
      columns: {
        id: true,
        externalAccountId: true,
        displayName: true,
        provider: true,
        lastSyncAt: true,
        status: true,
        lastError: true,
        createdAt: true,
      },
    });

    // Include workspace plan for client-side gating
    const [ws] = await tx
      .select({ plan: schema.workspaces.plan })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    return { accounts, ws };
  });

  const effectivePlan = isAdmin(session.user.email) ? 'pro' : (ws?.plan || 'free');
  return NextResponse.json({ accounts, plan: effectivePlan });
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

  // Enforce free-tier account limit before parsing body
  const { existingAccounts, ws } = await withWorkspace(workspace.workspaceId, async (tx) => {
    const existingAccounts = await tx
      .select({ id: schema.channelAccounts.id })
      .from(schema.channelAccounts)
      .where(eq(schema.channelAccounts.workspaceId, workspace.workspaceId));

    const [ws] = await tx
      .select({ plan: schema.workspaces.plan })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    return { existingAccounts, ws };
  });

  if (!canAddChannel(ws?.plan || 'free', existingAccounts.length, session.user.email)) {
    return NextResponse.json(
      { error: 'Account limit reached. Upgrade to Pro for unlimited accounts.', upgrade: true },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const data = addImapAccountSchema.parse(body);

    // Check if this workspace already connected this email
    const existing = await withWorkspace(workspace.workspaceId, (tx) =>
      tx.query.channelAccounts.findFirst({
        where: and(
          eq(schema.channelAccounts.externalAccountId, data.email),
          eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
          eq(schema.channelAccounts.provider, 'imap'),
        ),
      })
    );

    if (existing) {
      return NextResponse.json({ error: 'You have already connected this email account' }, { status: 400 });
    }

    // Encrypt all IMAP/SMTP credentials into a single JSON blob
    const creds: ImapCredentials = {
      username: data.email,
      password: data.password,
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapSecure: data.imapPort === 993,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpPort === 465,
    };
    const credentialsEncrypted = encryptJSON(creds);

    const [inserted] = await withWorkspace(workspace.workspaceId, (tx) => tx.insert(schema.channelAccounts).values({
      workspaceId: workspace.workspaceId,
      userId: session.user.id,
      provider: 'imap',
      externalAccountId: data.email,
      displayName: data.displayName || data.email.split('@')[0],
      status: 'active',
      credentialsEncrypted,
    }).returning({ id: schema.channelAccounts.id }));

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

  // Verify ownership via workspace scope, then delete in the same transaction
  const found = await withWorkspace(workspace.workspaceId, async (tx) => {
    const account = await tx.query.channelAccounts.findFirst({
      where: and(
        eq(schema.channelAccounts.id, accountId),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
      ),
    });

    if (!account) return false;

    await tx.delete(schema.channelAccounts).where(
      and(
        eq(schema.channelAccounts.id, accountId),
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
      )
    );
    return true;
  });

  if (!found) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

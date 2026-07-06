import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { withWorkspace, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const { id } = await params;

  const msg = await withWorkspace(workspace.workspaceId, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.id, id), eq(schema.messages.workspaceId, workspace.workspaceId)));

    // Mark as read
    if (row && !row.isRead) {
      await tx.update(schema.messages).set({ isRead: true, updatedAt: new Date() }).where(eq(schema.messages.id, id));
    }
    return row;
  });

  if (!msg) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

  // Map Track A → shape the display component expects
  const from = msg.fromIdentity as { kind?: string; value?: string; display?: string } | null;
  const toList = (msg.toIdentities as Array<{ kind?: string; value?: string; display?: string }>) ?? [];

  return NextResponse.json({
    email: {
      id: msg.id,
      accountId: msg.channelAccountId,
      messageId: msg.providerMessageId,
      subject: msg.subject,
      fromAddress: from?.value ?? '',
      fromName: from?.display ?? '',
      toAddresses: JSON.stringify(toList.map((t) => ({ address: t.value, name: t.display }))),
      ccAddresses: null,
      sentAt: msg.sentAt?.toISOString() ?? null,
      receivedAt: msg.receivedAt.toISOString(),
      bodyText: msg.bodyText,
      bodyHtml: msg.bodyHtml,
      isRead: true, // we just marked it
      isStarred: msg.isStarred,
      isArchived: false,
      hasAttachments: msg.hasAttachments,
      aiCategory: msg.aiCategory,
      aiPriority: msg.aiPriority,
      aiSummary: msg.aiSummary,
      aiSuggestedReplies: msg.aiSuggestedReplies ? JSON.stringify(msg.aiSuggestedReplies) : null,
      attachments: [],
    },
  });
}

const updateSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const { id } = await params;
  const body = await request.json();
  const updates = updateSchema.parse(body);

  await withWorkspace(workspace.workspaceId, (tx) => tx
    .update(schema.messages)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(schema.messages.id, id), eq(schema.messages.workspaceId, workspace.workspaceId))));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const { id } = await params;

  await withWorkspace(workspace.workspaceId, (tx) => tx
    .update(schema.messages)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(schema.messages.id, id), eq(schema.messages.workspaceId, workspace.workspaceId))));

  return NextResponse.json({ success: true });
}

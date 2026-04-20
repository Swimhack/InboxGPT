import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db, schema } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import { requireWorkspace } from '@/lib/auth/workspace';
import nodemailer from 'nodemailer';

const bodySchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['admin', 'member']).default('member'),
});

async function sendInviteEmail(params: {
  toEmail: string;
  inviteUrl: string;
  workspaceName: string;
  inviterName: string;
  role: string;
}) {
  const host = process.env.NOTIFICATION_SMTP_HOST;
  if (!host) {
    console.info('[invite] NOTIFICATION_SMTP_HOST not set — skipping email, invite URL:', params.inviteUrl);
    return;
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.NOTIFICATION_SMTP_PORT || 587),
    secure: process.env.NOTIFICATION_SMTP_SECURE === 'true',
    auth: {
      user: process.env.NOTIFICATION_SMTP_USER,
      pass: process.env.NOTIFICATION_SMTP_PASS,
    },
  });
  const from = process.env.NOTIFICATION_EMAIL_FROM || '"InboxGPT" <noreply@inboxgpt.io>';
  await transporter.sendMail({
    from,
    to: params.toEmail,
    subject: `${params.inviterName} invited you to join ${params.workspaceName} on InboxGPT`,
    text: [
      `You've been invited to join ${params.workspaceName} as a ${params.role}.`,
      '',
      'Click the link below to accept your invitation:',
      params.inviteUrl,
      '',
      'This invitation expires in 7 days.',
    ].join('\n'),
    html: `
      <p>You've been invited to join <strong>${params.workspaceName}</strong> as a <strong>${params.role}</strong>.</p>
      <p><a href="${params.inviteUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept invitation</a></p>
      <p style="color:#6b7280;font-size:14px">This invitation expires in 7 days. If you didn't expect this, you can safely ignore it.</p>
    `,
  });
}

export async function POST(request: NextRequest) {
  const workspace = await requireWorkspace();
  if (!['owner', 'admin'].includes(workspace.role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite members' }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { email, role } = parsed.data;

  // Check if already a member
  const [ws] = await db
    .select({ name: schema.workspaces.name })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.workspaceId));

  const existingMember = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspace.workspaceId),
        eq(schema.users.email, email)
      )
    )
    .limit(1);

  if (existingMember.length > 0) {
    return NextResponse.json({ error: 'User is already a member of this workspace' }, { status: 409 });
  }

  // Upsert: if pending invite exists for same email+workspace, refresh token+expiry
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .insert(schema.invitations)
    .values({
      workspaceId: workspace.workspaceId,
      email,
      role,
      token,
      invitedByUserId: workspace.userId,
      expiresAt,
    });

  const baseUrl = process.env.NEXTAUTH_URL || 'https://inboxgpt.fly.dev';
  const inviteUrl = `${baseUrl}/invite/${token}`;

  const [inviter] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, workspace.userId))
    .limit(1);

  sendInviteEmail({
    toEmail: email,
    inviteUrl,
    workspaceName: ws?.name ?? 'your workspace',
    inviterName: inviter?.name ?? 'A teammate',
    role,
  }).catch((err) => console.error('[invite] email failed', err));

  return NextResponse.json({ ok: true, inviteUrl });
}

export async function GET() {
  const workspace = await requireWorkspace();
  if (!['owner', 'admin'].includes(workspace.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pending = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      createdAt: schema.invitations.createdAt,
    })
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.workspaceId, workspace.workspaceId),
        isNull(schema.invitations.acceptedAt)
      )
    );

  return NextResponse.json(pending);
}

/**
 * POST /api/channels/twilio/connect
 *
 * Registers the configured Twilio phone number as a channel_accounts row for the
 * current workspace. Credentials (SID + auth token) are read from env vars at
 * runtime — this keeps multi-tenant credential isolation simple: each workspace
 * uses the same Twilio account but tracks its own phone numbers in the DB.
 *
 * Body: { phoneNumber?: string; displayName?: string }
 *
 * If phoneNumber is omitted, TWILIO_PHONE_NUMBER env var is used as default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { withWorkspace, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  phoneNumber: z.string().optional(),
  displayName: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  // Validate that Twilio env vars are configured before touching the DB.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const defaultPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token) {
    return NextResponse.json(
      {
        error:
          'Twilio is not configured. Ask your admin to set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
        code: 'twilio_not_configured',
      },
      { status: 503 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.errors[0].message : 'Invalid payload';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const phoneNumber = body.phoneNumber || defaultPhone;

  if (!phoneNumber) {
    return NextResponse.json(
      {
        error:
          'No phone number provided. Pass phoneNumber in the request body or set TWILIO_PHONE_NUMBER.',
        code: 'phone_number_required',
      },
      { status: 400 }
    );
  }

  // Normalise to E.164 — strip spaces and ensure + prefix.
  const e164 = phoneNumber.replace(/\s/g, '').startsWith('+')
    ? phoneNumber.replace(/\s/g, '')
    : `+${phoneNumber.replace(/\s/g, '')}`;

  // Verify the phone number exists in this Twilio account (optional live check).
  // We only do this when a custom phoneNumber is supplied to avoid unnecessary
  // API calls when the admin has already set the env var.
  if (body.phoneNumber) {
    const verifyRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        },
      }
    );

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return NextResponse.json(
        {
          error: `Could not verify phone number with Twilio (${verifyRes.status}): ${errText}`,
          code: 'twilio_verify_failed',
        },
        { status: 400 }
      );
    }

    const verifyData = (await verifyRes.json()) as { incoming_phone_numbers?: unknown[] };
    if ((verifyData.incoming_phone_numbers ?? []).length === 0) {
      return NextResponse.json(
        {
          error: `Phone number ${e164} was not found in your Twilio account.`,
          code: 'phone_not_found',
        },
        { status: 400 }
      );
    }
  }

  // Duplicate check + insert in one workspace-scoped transaction.
  const inserted = await withWorkspace(workspace.workspaceId, async (tx) => {
    const existing = await tx
      .select({ id: schema.channelAccounts.id })
      .from(schema.channelAccounts)
      .where(
        and(
          eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
          eq(schema.channelAccounts.provider, 'twilio'),
          eq(schema.channelAccounts.externalAccountId, e164)
        )
      );

    if (existing.length > 0) return null;

    const [row] = await tx
      .insert(schema.channelAccounts)
      .values({
        workspaceId: workspace.workspaceId,
        userId: session.user.id as string,
        provider: 'twilio',
        externalAccountId: e164,
        displayName: body.displayName || e164,
        status: 'active',
        // No credentialsEncrypted — Twilio auth comes from TWILIO_AUTH_TOKEN env var at runtime.
        credentialsEncrypted: null,
      })
      .returning({ id: schema.channelAccounts.id });
    return row;
  });

  if (!inserted) {
    return NextResponse.json({ error: 'This phone number is already connected.' }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    accountId: inserted.id,
    phoneNumber: e164,
  });
}

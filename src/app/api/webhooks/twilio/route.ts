import { NextRequest, NextResponse } from 'next/server';
import { verifyTwilio } from '@/lib/webhooks/verify';
import { recordWebhookEvent, enqueueNormalizeInbound } from '@/lib/webhooks/enqueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const url = req.nextUrl.href.split('?')[0];
  const signature = req.headers.get('x-twilio-signature');

  const verify = verifyTwilio({ url, params, signature });
  if (!verify.ok) {
    return new NextResponse(`invalid signature: ${verify.reason}`, { status: 401 });
  }

  const eventId = params.MessageSid || params.CallSid || `twilio-${Date.now()}`;
  const { eventId: rowId, duplicate } = await recordWebhookEvent({
    provider: 'twilio',
    externalEventId: eventId,
    signatureOk: true,
    payload: params,
  });

  if (!duplicate) await enqueueNormalizeInbound(rowId, null);

  return NextResponse.json({ ok: true, duplicate });
}

export async function GET() {
  return NextResponse.json({ status: 'twilio webhook ready' });
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyDiscord } from '@/lib/webhooks/verify';
import { recordWebhookEvent, enqueueNormalizeInbound } from '@/lib/webhooks/enqueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const timestamp = req.headers.get('x-signature-timestamp');
  const signature = req.headers.get('x-signature-ed25519');

  const verify = await verifyDiscord({ rawBody: raw, timestamp, signature });
  if (!verify.ok) {
    return new NextResponse(`invalid signature: ${verify.reason}`, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Interaction ping (type 1) must echo with {type: 1} to register the endpoint.
  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  const eventId = body.id || `discord-${Date.now()}`;
  const { eventId: rowId, duplicate } = await recordWebhookEvent({
    provider: 'discord',
    externalEventId: String(eventId),
    signatureOk: true,
    payload: body,
  });

  if (!duplicate) await enqueueNormalizeInbound(rowId, null);

  return NextResponse.json({ type: 4, data: { content: 'ok' } });
}

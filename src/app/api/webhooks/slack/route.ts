import { NextRequest, NextResponse } from 'next/server';
import { verifySlack } from '@/lib/webhooks/verify';
import { recordWebhookEvent, enqueueNormalizeInbound } from '@/lib/webhooks/enqueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  const verify = verifySlack({ rawBody: raw, timestamp, signature });
  if (!verify.ok) {
    return new NextResponse(`invalid signature: ${verify.reason}`, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // URL verification handshake on app install.
  if (body.type === 'url_verification' && typeof body.challenge === 'string') {
    return new NextResponse(body.challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  const eventId =
    body.event_id ||
    (body.event?.ts && `${body.team_id}:${body.event.channel}:${body.event.ts}`) ||
    `slack-${Date.now()}`;

  const { eventId: rowId, duplicate } = await recordWebhookEvent({
    provider: 'slack',
    externalEventId: String(eventId),
    signatureOk: true,
    payload: body,
  });

  if (!duplicate) await enqueueNormalizeInbound(rowId, null);

  return NextResponse.json({ ok: true, duplicate });
}

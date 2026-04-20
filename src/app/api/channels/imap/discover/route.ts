import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { discoverEmailConfig } from '@/lib/email/autodiscover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/channels/imap/discover
 * Body: { email }
 * Returns the best-guess IMAP/SMTP configuration for the given address.
 * 404 when nothing could be discovered — the client falls back to manual entry.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let data: z.infer<typeof bodySchema>;
  try {
    data = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const cfg = await discoverEmailConfig(data.email);
  if (!cfg) {
    return NextResponse.json(
      { error: 'Could not auto-detect settings for this domain.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ config: cfg });
}

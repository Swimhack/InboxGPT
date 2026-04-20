import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { discoverEmailConfig } from '@/lib/email/autodiscover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const query = z.object({ email: z.string().email() });

/**
 * GET /api/accounts/autoconfig?email=user@domain
 *
 * Returns { found: true, config } with the best-guess IMAP/SMTP settings plus
 * OAuth-availability flags. The client uses this to hide technical fields and
 * to decide whether to offer a one-click OAuth button.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = query.safeParse({ email: url.searchParams.get('email') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const config = await discoverEmailConfig(parsed.data.email);
  if (!config) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, config });
}

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { generateBriefForUser } from '@/lib/ai/brief';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Accept client timezone for accurate greeting
    let timezone: string | undefined;
    try {
      const body = await req.json();
      timezone = body.timezone;
    } catch {
      // No body is fine
    }

    const brief = await generateBriefForUser(session.user.id, timezone);
    return NextResponse.json({ brief });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate brief';

    if (message.includes('not available') || message.includes('limit')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error('[Brief] Generation failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

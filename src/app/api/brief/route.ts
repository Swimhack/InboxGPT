import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { generateBriefForUser } from '@/lib/ai/brief';
import { checkRateLimit } from '@/lib/rate-limit';

const BRIEF_RATE_LIMIT = { limit: 5, windowMs: 60_000 }; // 5 per minute

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Per-user rate limiting
  const rl = checkRateLimit(`brief:${session.user.id}`, BRIEF_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
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

    // Stored AI key could not be decrypted -> actionable 400 so the UI can
    // point the user at Settings rather than showing a generic 500.
    if (message.startsWith('STORED_AI_KEY_INVALID')) {
      return NextResponse.json(
        {
          error:
            'Your saved AI API key could not be read. Please re-enter it in Settings.',
          code: 'STORED_AI_KEY_INVALID',
        },
        { status: 400 }
      );
    }

    // Raw AES-GCM failure (safety net in case a different path leaks it).
    if (/unsupported state|unable to authenticate data/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'Stored credentials could not be decrypted. Please re-enter your AI API key in Settings.',
          code: 'DECRYPT_FAILED',
        },
        { status: 400 }
      );
    }

    // Never leak internal driver errors into the UI.
    const safeMessage = /sqlite|pg|postgres|bind|no such (table|column)/i.test(message)
      ? 'Brief is temporarily unavailable. Please try again in a minute.'
      : message;

    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

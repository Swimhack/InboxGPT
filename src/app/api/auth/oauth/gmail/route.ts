import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/oauth/gmail
 *
 * Delegates to NextAuth's built-in Google sign-in endpoint. NextAuth's
 * redirect URI (`/api/auth/callback/google`) is what's registered in
 * Google Cloud Console, so we reuse it — our own custom callback path
 * would fail with redirect_uri_mismatch unless the administrator also
 * adds it in the GCP OAuth client.
 *
 * The NextAuth `signIn` callback (src/lib/auth/config.ts) handles the
 * channel-upsert side-effect via `upsertChannelAccount`, so landing back
 * on the page results in the Gmail account being connected.
 */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') ?? '/connect-channels';
  const callbackUrl = encodeURIComponent(from);
  // Prefer NEXTAUTH_URL in production — request.nextUrl.origin may resolve to
  // the internal Fly container origin (localhost:3000) behind the proxy.
  const base = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  return NextResponse.redirect(
    new URL(`/api/auth/signin/google?callbackUrl=${callbackUrl}&prompt=select_account`, base)
  );
}

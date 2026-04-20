import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/oauth/outlook
 *
 * Delegates to NextAuth's built-in Azure AD sign-in endpoint. NextAuth
 * owns the registered redirect URI (`/api/auth/callback/azure-ad`) in
 * the Azure AD app registration, so reusing it avoids
 * redirect_uri_mismatch errors.
 *
 * If AZURE_AD_CLIENT_ID/_SECRET aren't set in env, NextAuth doesn't
 * register the provider and this redirect will land on NextAuth's
 * built-in error page with a clear message.
 */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') ?? '/connect-channels';
  const callbackUrl = encodeURIComponent(from);

  if (!process.env.AZURE_AD_CLIENT_ID || !process.env.AZURE_AD_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Outlook OAuth not configured on this server. Ask your admin to set AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET.' },
      { status: 501 }
    );
  }

  const base = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  return NextResponse.redirect(
    new URL(`/api/auth/signin/azure-ad?callbackUrl=${callbackUrl}&prompt=select_account`, base)
  );
}

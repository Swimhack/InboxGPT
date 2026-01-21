import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { encryptOAuthTokens } from '@/lib/crypto/encryption';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error) {
    return NextResponse.redirect(new URL(`/accounts?error=${error}`, process.env.NEXTAUTH_URL));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/accounts?error=no_code', process.env.NEXTAUTH_URL));
  }

  if (state !== session.user.id) {
    return NextResponse.redirect(new URL('/accounts?error=invalid_state', process.env.NEXTAUTH_URL));
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/oauth/gmail/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(new URL('/accounts?error=token_exchange', process.env.NEXTAUTH_URL));
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(new URL('/accounts?error=userinfo', process.env.NEXTAUTH_URL));
    }

    const userInfo = await userInfoResponse.json();

    // Encrypt tokens
    const encryptedTokens = encryptOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Save account to database
    const accountId = generateId();

    await db.insert(schema.emailAccounts).values({
      id: accountId,
      userId: session.user.id,
      email: userInfo.email,
      displayName: userInfo.name || userInfo.email.split('@')[0],
      providerType: 'gmail',
      encryptedAccessToken: encryptedTokens.accessToken,
      encryptedRefreshToken: encryptedTokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      syncStatus: 'idle',
      isActive: true,
    });

    return NextResponse.redirect(new URL('/accounts?success=gmail', process.env.NEXTAUTH_URL));
  } catch (error) {
    console.error('Gmail OAuth error:', error);
    return NextResponse.redirect(new URL('/accounts?error=oauth_failed', process.env.NEXTAUTH_URL));
  }
}

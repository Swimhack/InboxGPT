import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { encryptOAuthTokens } from '@/lib/crypto/encryption';

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com';

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
    const errorDescription = searchParams.get('error_description');
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(new URL(`/accounts?error=${error}`, process.env.NEXTAUTH_URL));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/accounts?error=no_code', process.env.NEXTAUTH_URL));
  }

  if (state !== session.user.id) {
    return NextResponse.redirect(new URL('/accounts?error=invalid_state', process.env.NEXTAUTH_URL));
  }

  const tenantId = process.env.AZURE_AD_TENANT_ID || 'common';

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(`${MICROSOFT_TOKEN_URL}/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/oauth/outlook/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(new URL('/accounts?error=token_exchange', process.env.NEXTAUTH_URL));
    }

    const tokens = await tokenResponse.json();

    // Decode the ID token to get user info
    const idTokenPayload = JSON.parse(
      Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()
    );

    const email = idTokenPayload.email || idTokenPayload.preferred_username;
    const name = idTokenPayload.name;

    if (!email) {
      return NextResponse.redirect(new URL('/accounts?error=no_email', process.env.NEXTAUTH_URL));
    }

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
      email,
      displayName: name || email.split('@')[0],
      providerType: 'outlook',
      encryptedAccessToken: encryptedTokens.accessToken,
      encryptedRefreshToken: encryptedTokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      syncStatus: 'idle',
      isActive: true,
    });

    return NextResponse.redirect(new URL('/accounts?success=outlook', process.env.NEXTAUTH_URL));
  } catch (error) {
    console.error('Outlook OAuth error:', error);
    return NextResponse.redirect(new URL('/accounts?error=oauth_failed', process.env.NEXTAUTH_URL));
  }
}

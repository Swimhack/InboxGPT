import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL));
  }

  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const tenantId = process.env.AZURE_AD_TENANT_ID || 'common';

  if (!clientId) {
    return NextResponse.json({ error: 'Outlook OAuth not configured' }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/oauth/outlook/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'https://outlook.office.com/IMAP.AccessAsUser.All',
      'https://outlook.office.com/SMTP.Send',
      'https://outlook.office.com/Mail.Read',
      'https://outlook.office.com/Mail.Send',
    ].join(' '),
    response_mode: 'query',
    state: session.user.id,
  });

  return NextResponse.redirect(`${MICROSOFT_AUTH_URL}/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`);
}

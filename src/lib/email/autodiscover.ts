/**
 * Adapter that exposes `discoverEmailConfig()` in the shape the channel
 * routes expect. Delegates to `resolveAutoconfig()` (Mozilla ISPDB + DNS SRV
 * + MX inference + heuristics) and normalises the fields.
 */
import { resolveAutoconfig } from './autoconfig';

export interface DiscoveredConfig {
  providerId: string;
  providerName: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  oauthSupported: boolean;
  /**
   * True when the provider has disabled or discourages password-based IMAP login
   * (M365 disabled basic auth in 2022; Google requires an app password).
   * The UI should steer users to OAuth instead of accepting a password.
   */
  oauthRequired: boolean;
  /**
   * True when the server DOES NOT have OAuth credentials configured for the
   * provider the user needs. The UI should explain the situation instead of
   * offering a broken one-click button.
   */
  oauthUnavailable: boolean;
  oauthUnavailableReason?: string;
  oauthProvider?: 'gmail' | 'outlook';
  oauthInitiatePath?: string;
  appPasswordRequired?: boolean;
  appPasswordUrl?: string;
  appPasswordInstructions?: string;
  helpUrl?: string;
  icon?: string;
  source:
    | 'builtin'
    | 'ispdb'
    | 'srv'
    | 'mx-google'
    | 'mx-m365'
    | 'heuristic';
}

function isOAuthConfigured(provider: 'gmail' | 'outlook'): boolean {
  if (provider === 'gmail') {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  return Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET);
}

export async function discoverEmailConfig(email: string): Promise<DiscoveredConfig | null> {
  const result = await resolveAutoconfig(email);
  if (!result) return null;

  // M365 disabled basic auth; Google Workspace strongly prefers OAuth.
  const isM365 =
    result.source === 'mx-m365' ||
    (result.source === 'builtin' && result.imap.host === 'outlook.office365.com');
  const isGoogle =
    result.source === 'mx-google' ||
    (result.source === 'builtin' && result.imap.host === 'imap.gmail.com');

  const oauthProvider: 'gmail' | 'outlook' | undefined = isM365
    ? 'outlook'
    : isGoogle
      ? 'gmail'
      : undefined;

  const oauthConfigured = oauthProvider ? isOAuthConfigured(oauthProvider) : false;
  const oauthUnavailable = Boolean(oauthProvider) && !oauthConfigured;
  const oauthUnavailableReason = !oauthProvider
    ? undefined
    : oauthProvider === 'outlook'
      ? 'Microsoft OAuth is not configured on this server. Ask your admin to set AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET.'
      : 'Google OAuth is not configured on this server. Ask your admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.';

  return {
    providerId: result.source,
    providerName: result.providerName ?? email.split('@')[1] ?? 'Custom IMAP',
    imap: result.imap,
    smtp: result.smtp,
    oauthSupported: (result.oauthSupported ?? false) || isM365 || isGoogle,
    oauthRequired: isM365 || isGoogle,
    oauthUnavailable,
    oauthUnavailableReason: oauthUnavailable ? oauthUnavailableReason : undefined,
    oauthProvider,
    oauthInitiatePath: oauthConfigured
      ? isM365
        ? '/api/auth/oauth/outlook?from=/connect-channels'
        : isGoogle
          ? '/api/auth/oauth/gmail?from=/connect-channels'
          : undefined
      : undefined,
    appPasswordRequired: Boolean(result.appPasswordInstructions),
    appPasswordUrl: result.appPasswordUrl,
    appPasswordInstructions: result.appPasswordInstructions,
    helpUrl: result.helpUrl,
    source: result.source,
  };
}

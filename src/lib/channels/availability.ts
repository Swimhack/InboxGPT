import type { ChannelProvider } from './catalog';

/**
 * Server-only: returns which channel providers are actually reachable
 * given the current process env. Unconfigured providers should render
 * as "coming-soon" in the UI so the user never hits a raw JSON error
 * from an initiate route.
 */
export function getProviderAvailability(): Record<ChannelProvider, { ready: boolean; reason?: string }> {
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const azure = Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET);

  return {
    gmail: {
      ready: google,
      reason: google ? undefined : 'Set GOOGLE_CLIENT_ID to enable Gmail.',
    },
    outlook: {
      ready: azure,
      reason: azure ? undefined : 'Set AZURE_AD_CLIENT_ID to enable Outlook.',
    },
    imap: { ready: true },
    slack: { ready: true },
    discord: { ready: true },
    signal: { ready: false, reason: 'Available in the next release.' },
    twilio: { ready: false, reason: 'Credential form ships in the next release.' },
    whatsapp: { ready: false, reason: 'Requires WhatsApp Business approval.' },
    meta_ig: { ready: false, reason: 'Awaiting Meta app review.' },
    meta_fb: { ready: false, reason: 'Awaiting Meta app review.' },
    x: { ready: false, reason: 'Requires X Enterprise API tier.' },
    linkedin: { ready: false, reason: 'Requires LinkedIn Partner approval.' },
  };
}

/**
 * Email Provider Configuration
 *
 * Auto-detects email providers from email addresses and provides
 * pre-configured IMAP/SMTP settings. No more manual configuration!
 */

export type AuthType = 'oauth' | 'app-password';

export interface ProviderConfig {
  name: string;
  domains: string[]; // All domains this provider handles
  imap: {
    host: string;
    port: number;
    secure: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
  authType: AuthType;
  oauthSupported: boolean;
  appPasswordRequired?: boolean;
  appPasswordUrl?: string;
  appPasswordInstructions?: string;
  helpUrl?: string;
  icon?: string; // Emoji or icon name
}

// Provider configurations for common email services
export const EMAIL_PROVIDERS: Record<string, ProviderConfig> = {
  gmail: {
    name: 'Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    authType: 'oauth',
    oauthSupported: true,
    appPasswordRequired: true, // If not using OAuth
    appPasswordUrl: 'https://myaccount.google.com/apppasswords',
    appPasswordInstructions:
      'Go to Google Account → Security → 2-Step Verification → App passwords. Create a new app password for "Mail" and use it here.',
    helpUrl: 'https://support.google.com/mail/answer/7126229',
    icon: '📧',
  },

  outlook: {
    name: 'Outlook / Microsoft 365',
    domains: [
      'outlook.com',
      'hotmail.com',
      'live.com',
      'msn.com',
      'outlook.co.uk',
      'outlook.de',
      'outlook.fr',
      'outlook.jp',
    ],
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    authType: 'oauth',
    oauthSupported: true,
    helpUrl: 'https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040',
    icon: '📬',
  },

  yahoo: {
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.de', 'yahoo.fr', 'yahoo.co.jp', 'ymail.com', 'rocketmail.com'],
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://login.yahoo.com/account/security/app-passwords',
    appPasswordInstructions:
      'Go to Yahoo Account Info → Security → Generate app password. Select "Other App" and use the generated password here.',
    helpUrl: 'https://help.yahoo.com/kb/generate-app-password-sln15241.html',
    icon: '💜',
  },

  icloud: {
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://appleid.apple.com/account/manage',
    appPasswordInstructions:
      'Go to appleid.apple.com → Sign-In and Security → App-Specific Passwords. Generate a new password and use it here.',
    helpUrl: 'https://support.apple.com/en-us/HT204397',
    icon: '🍎',
  },

  aol: {
    name: 'AOL Mail',
    domains: ['aol.com', 'aim.com'],
    imap: { host: 'imap.aol.com', port: 993, secure: true },
    smtp: { host: 'smtp.aol.com', port: 465, secure: true },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://login.aol.com/account/security/app-passwords',
    appPasswordInstructions:
      'Go to AOL Account Security → Generate app password. Use the generated password here.',
    icon: '📮',
  },

  protonmail: {
    name: 'ProtonMail',
    domains: ['protonmail.com', 'proton.me', 'pm.me'],
    imap: { host: 'mail.protonmail.com', port: 993, secure: true },
    smtp: { host: 'mail.protonmail.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordInstructions:
      'ProtonMail requires the ProtonMail Bridge app for IMAP access. Download it from protonmail.com/bridge',
    helpUrl: 'https://protonmail.com/bridge',
    icon: '🔒',
  },

  zoho: {
    name: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com'],
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://accounts.zoho.com/home#security/security_pwd',
    appPasswordInstructions:
      'Go to Zoho Account → Security → App Passwords. Generate a new password for email access.',
    icon: '📨',
  },

  fastmail: {
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    imap: { host: 'imap.fastmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.fastmail.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://www.fastmail.com/settings/security/devicekeys/',
    appPasswordInstructions:
      'Go to Settings → Password & Security → App Passwords. Create a new app password.',
    icon: '⚡',
  },

  gmx: {
    name: 'GMX Mail',
    domains: ['gmx.com', 'gmx.net', 'gmx.de'],
    imap: { host: 'imap.gmx.com', port: 993, secure: true },
    smtp: { host: 'mail.gmx.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    helpUrl: 'https://support.gmx.com/pop-imap/toggle.html',
    icon: '📩',
  },
};

/**
 * Detect provider from email address
 */
export function detectProvider(email: string): ProviderConfig | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Check each provider's domains
  for (const [, config] of Object.entries(EMAIL_PROVIDERS)) {
    if (config.domains.includes(domain)) {
      return config;
    }
  }

  return null;
}

/**
 * Get provider by name
 */
export function getProviderByName(name: string): ProviderConfig | null {
  return EMAIL_PROVIDERS[name.toLowerCase()] || null;
}

/**
 * Check if a domain is supported
 */
export function isDomainSupported(email: string): boolean {
  return detectProvider(email) !== null;
}

/**
 * Get all supported providers for display
 */
export function getSupportedProviders(): Array<ProviderConfig & { id: string }> {
  return Object.entries(EMAIL_PROVIDERS).map(([id, config]) => ({
    id,
    ...config,
  }));
}

/**
 * Get provider that supports OAuth (for one-click connection)
 */
export function getOAuthProviders(): Array<ProviderConfig & { id: string }> {
  return getSupportedProviders().filter((p) => p.oauthSupported);
}

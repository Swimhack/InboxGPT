/**
 * Server-only IMAP/SMTP autoconfig resolver.
 *
 * Strategy, in order (stops at first hit):
 *   1. Built-in EMAIL_PROVIDERS map (gmail, outlook, yahoo, ...).
 *   2. Mozilla Autoconfig / Thunderbird ISPDB (public XML service — free).
 *   3. DNS SRV records (RFC 6186: _imaps._tcp, _submissions._tcp).
 *   4. MX-based inference (if MX points to google.com → Gmail settings,
 *      if MX points to outlook.com → M365 settings).
 *   5. Heuristic: try mail.<domain> and imap.<domain> A records.
 */

import { promises as dns } from 'dns';
import { detectProvider, EMAIL_PROVIDERS, type ProviderConfig } from './provider-config';

export interface AutoconfigResult {
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  source: 'builtin' | 'ispdb' | 'srv' | 'mx-google' | 'mx-m365' | 'heuristic';
  providerName?: string;
  helpUrl?: string;
  appPasswordUrl?: string;
  appPasswordInstructions?: string;
  oauthSupported?: boolean;
}

const ISPDB_URL = 'https://autoconfig.thunderbird.net/v1.1';

/**
 * Entry point — resolve IMAP/SMTP for an email address.
 * Never throws — returns null if nothing worked.
 */
export async function resolveAutoconfig(email: string): Promise<AutoconfigResult | null> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // 1. Built-in map
  const builtin = detectProvider(email);
  if (builtin) return fromBuiltin(builtin);

  // 2. Mozilla ISPDB
  const ispdb = await tryISPDB(domain).catch(() => null);
  if (ispdb) return ispdb;

  // 3. DNS SRV
  const srv = await trySRV(domain).catch(() => null);
  if (srv) return srv;

  // 4. MX-based inference (catches any domain that uses Google Workspace or M365)
  const mx = await tryMX(domain).catch(() => null);
  if (mx) return mx;

  // 5. Heuristic A lookups
  const heuristic = await tryHeuristic(domain).catch(() => null);
  if (heuristic) return heuristic;

  return null;
}

function fromBuiltin(p: ProviderConfig): AutoconfigResult {
  return {
    imap: p.imap,
    smtp: p.smtp,
    source: 'builtin',
    providerName: p.name,
    helpUrl: p.helpUrl,
    appPasswordUrl: p.appPasswordUrl,
    appPasswordInstructions: p.appPasswordInstructions,
    oauthSupported: p.oauthSupported,
  };
}

async function tryISPDB(domain: string): Promise<AutoconfigResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${ISPDB_URL}/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/xml' },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    return parseISPDBXml(xml);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the relevant fragments from a Mozilla autoconfig XML doc.
 * We only care about incomingServer type="imap" and outgoingServer type="smtp".
 */
export function parseISPDBXml(xml: string): AutoconfigResult | null {
  const imap = extractServer(xml, 'imap', 'incomingServer');
  const smtp = extractServer(xml, 'smtp', 'outgoingServer');
  if (!imap || !smtp) return null;

  const displayNameMatch = /<displayName>([^<]+)<\/displayName>/.exec(xml);
  return {
    imap,
    smtp,
    source: 'ispdb',
    providerName: displayNameMatch?.[1]?.trim(),
  };
}

function extractServer(
  xml: string,
  type: 'imap' | 'smtp',
  tag: 'incomingServer' | 'outgoingServer'
): { host: string; port: number; secure: boolean } | null {
  // Grab the first <tag type="type">...</tag> block
  const blockRe = new RegExp(`<${tag}\\s+type="${type}"[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const block = blockRe.exec(xml);
  if (!block) return null;
  const body = block[1];

  const host = /<hostname>([^<]+)<\/hostname>/i.exec(body)?.[1]?.trim();
  const portStr = /<port>(\d+)<\/port>/i.exec(body)?.[1];
  const socketType = /<socketType>([^<]+)<\/socketType>/i.exec(body)?.[1]?.trim();

  if (!host || !portStr) return null;
  const port = Number.parseInt(portStr, 10);
  const secure = /ssl/i.test(socketType ?? '') || port === 993 || port === 465;
  return { host, port, secure };
}

async function trySRV(domain: string): Promise<AutoconfigResult | null> {
  // RFC 6186: prefer submissions/imaps (TLS), fall back to submission/imap + STARTTLS
  const imapRec =
    (await safeResolveSrv(`_imaps._tcp.${domain}`)) ??
    (await safeResolveSrv(`_imap._tcp.${domain}`));
  const smtpRec =
    (await safeResolveSrv(`_submissions._tcp.${domain}`)) ??
    (await safeResolveSrv(`_submission._tcp.${domain}`));

  if (!imapRec || !smtpRec) return null;

  return {
    imap: {
      host: imapRec.name,
      port: imapRec.port,
      secure: imapRec.port === 993 || imapRec.port === 465,
    },
    smtp: {
      host: smtpRec.name,
      port: smtpRec.port,
      secure: smtpRec.port === 465,
    },
    source: 'srv',
  };
}

async function safeResolveSrv(name: string) {
  try {
    const records = await dns.resolveSrv(name);
    if (!records.length) return null;
    const best = records.sort((a, b) => a.priority - b.priority)[0];
    // Strip trailing dot from DNS name for display
    return { name: best.name.replace(/\.$/, ''), port: best.port };
  } catch {
    return null;
  }
}

async function tryMX(domain: string): Promise<AutoconfigResult | null> {
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx.length) return null;
    const top = mx.sort((a, b) => a.priority - b.priority)[0].exchange.toLowerCase();

    // Google Workspace uses aspmx.l.google.com / smtp.google.com
    if (top.endsWith('.google.com') || top.endsWith('.googlemail.com')) {
      const g = EMAIL_PROVIDERS.gmail;
      return {
        imap: g.imap,
        smtp: g.smtp,
        source: 'mx-google',
        providerName: 'Google Workspace',
        oauthSupported: true,
        appPasswordUrl: g.appPasswordUrl,
        appPasswordInstructions: g.appPasswordInstructions,
        helpUrl: g.helpUrl,
      };
    }
    // Microsoft 365 uses *.mail.protection.outlook.com
    if (top.endsWith('.outlook.com') || top.endsWith('.protection.outlook.com')) {
      const o = EMAIL_PROVIDERS.outlook;
      return {
        imap: o.imap,
        smtp: o.smtp,
        source: 'mx-m365',
        providerName: 'Microsoft 365',
        oauthSupported: true,
        helpUrl: o.helpUrl,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function tryHeuristic(domain: string): Promise<AutoconfigResult | null> {
  // Try common subdomain patterns that resolve to A records.
  const candidates = [`mail.${domain}`, `imap.${domain}`, domain];
  for (const host of candidates) {
    try {
      await dns.resolve4(host);
      return {
        imap: { host, port: 993, secure: true },
        smtp: { host: host.startsWith('imap.') ? `smtp.${domain}` : host, port: 587, secure: false },
        source: 'heuristic',
      };
    } catch {
      // next
    }
  }
  return null;
}

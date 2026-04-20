'use client';

import { useCallback, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Mail,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { detectProvider, EMAIL_PROVIDERS, type ProviderConfig } from '@/lib/email/provider-config';

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountAdded?: () => void;
}

type Step = 'email' | 'oauth-offer' | 'password';

interface DiscoveredSettings {
  providerName?: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  oauthSupported?: boolean;
  oauthRequired?: boolean;
  oauthUnavailable?: boolean;
  oauthUnavailableReason?: string;
  oauthProvider?: 'gmail' | 'outlook';
  oauthInitiatePath?: string;
  appPasswordUrl?: string;
  appPasswordInstructions?: string;
  helpUrl?: string;
  source: string;
}

/** Microsoft / Google hosted IMAP — password IMAP is blocked or discouraged. */
function hostedOAuthFromDiscovery(cfg: DiscoveredSettings): 'gmail' | 'outlook' | null {
  if (cfg.imap.host === 'outlook.office365.com') return 'outlook';
  if (cfg.imap.host === 'imap.gmail.com') return 'gmail';
  return null;
}

function oauthIdFromProvider(p: ProviderConfig): 'gmail' | 'outlook' {
  return p.domains.some((d) => d === 'gmail.com' || d === 'googlemail.com') ? 'gmail' : 'outlook';
}

/**
 * Simplified "connect email" dialog.
 *
 * The user never has to type hostnames or ports. They enter their email
 * and password; the server auto-discovers IMAP/SMTP settings via Mozilla
 * ISPDB / MX / SRV / heuristics and verifies the credentials before
 * storing them. If auto-discovery fails the user can reveal a manual
 * "advanced settings" fallback.
 */
export function AddAccountDialog({ open, onOpenChange, onAccountAdded }: AddAccountDialogProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [clientProvider, setClientProvider] = useState<ProviderConfig | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredSettings | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '587' });

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setStep('email');
    setEmail('');
    setPassword('');
    setClientProvider(null);
    setDiscovered(null);
    setDiscovering(false);
    setDiscoverError(null);
    setShowManual(false);
    setManual({ imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '587' });
    setConnecting(false);
    setConnectError(null);
  }, [open]);

  useEffect(() => {
    if (!email.includes('@')) {
      setClientProvider(null);
      return;
    }
    setClientProvider(detectProvider(email));
  }, [email]);

  const runDiscovery = useCallback(
    async (addr: string, opts?: { skipHostedOAuthPivot?: boolean }) => {
      setDiscovering(true);
      setDiscoverError(null);
      setConnectError(null);
      setPassword('');
      setDiscovered(null);
      setManual({ imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '587' });
      setShowManual(false);
      try {
        const res = await fetch(`/api/accounts/autoconfig?email=${encodeURIComponent(addr)}`);
        const data = await res.json();
        if (res.ok && data.found) {
          const cfg = data.config as DiscoveredSettings;
          setDiscovered(cfg);
          setManual({
            imapHost: cfg.imap.host,
            imapPort: String(cfg.imap.port),
            smtpHost: cfg.smtp.host,
            smtpPort: String(cfg.smtp.port),
          });
          const hosted = hostedOAuthFromDiscovery(cfg);
          if (hosted && !opts?.skipHostedOAuthPivot) {
            setClientProvider(EMAIL_PROVIDERS[hosted === 'gmail' ? 'gmail' : 'outlook']);
            setStep('oauth-offer');
          } else {
            setStep('password');
          }
        } else {
          const domain = addr.split('@')[1]?.toLowerCase() || '';
          setManual({
            imapHost: domain ? `mail.${domain}` : '',
            imapPort: '993',
            smtpHost: domain ? `mail.${domain}` : '',
            smtpPort: '587',
          });
          setDiscoverError(
            'We could not auto-detect your mail server. Enter the settings below and we will verify them.'
          );
          setShowManual(true);
          setStep('password');
        }
      } catch {
        setDiscoverError('Network error during auto-discovery. You can enter the settings manually.');
        setShowManual(true);
        setStep('password');
      } finally {
        setDiscovering(false);
      }
    },
    []
  );

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.includes('@')) return;
      // Always run discovery — it tells us whether OAuth is actually
      // configured on the server and sets oauthUnavailable so the UI can
      // explain rather than offer a broken button.
      await runDiscovery(email);
    },
    [email, runDiscovery]
  );

  const handleOAuthConnect = (providerId: 'gmail' | 'outlook') => {
    sessionStorage.setItem('pendingEmailConnection', email);
    // Use NextAuth's client signIn — handles CSRF and reuses the registered
    // /api/auth/callback/[provider] redirect URI in GCP / Azure.
    signIn(providerId === 'gmail' ? 'google' : 'azure-ad', {
      callbackUrl: '/connect-channels',
    });
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setConnecting(true);
    setConnectError(null);

    const overrides = showManual
      ? {
          imapHost: manual.imapHost || undefined,
          imapPort: manual.imapPort ? Number(manual.imapPort) : undefined,
          smtpHost: manual.smtpHost || undefined,
          smtpPort: manual.smtpPort ? Number(manual.smtpPort) : undefined,
        }
      : undefined;

    try {
      const res = await fetch('/api/channels/imap/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, overrides }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast({ title: 'Account connected', description: `Syncing ${email} now.` });
        onOpenChange(false);
        if (onAccountAdded) onAccountAdded();
        else window.location.reload();
        return;
      }

      if (data.code === 'oauth_required' && data.oauthUrl) {
        // Hard-stop: this provider won't accept IMAP basic auth. Redirect to OAuth.
        window.location.href = data.oauthUrl;
        return;
      } else if (res.status === 422 && data.needsManual) {
        setShowManual(true);
        setConnectError(data.error || 'Please enter your mail server settings below.');
      } else if (res.status === 409) {
        setConnectError('This email is already connected.');
      } else {
        setConnectError(data.error || 'Could not connect. Check your password and try again.');
      }
    } catch {
      setConnectError('Network error. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const providerIcon = clientProvider?.icon || '📧';
  const providerName =
    discovered?.providerName || clientProvider?.name || email.split('@')[1] || 'Custom IMAP';
  const appPasswordRequired =
    !!(discovered?.appPasswordInstructions || clientProvider?.appPasswordRequired);
  const appPasswordUrl = discovered?.appPasswordUrl || clientProvider?.appPasswordUrl;
  const appPasswordInstructions =
    discovered?.appPasswordInstructions || clientProvider?.appPasswordInstructions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'email' && 'Connect an email account'}
            {step === 'oauth-offer' && `Connect ${clientProvider?.name}`}
            {step === 'password' && `Sign in to ${providerName}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'email' && 'Just your email — we will find the right server automatically.'}
            {step === 'oauth-offer' && 'Choose how you want to connect.'}
            {step === 'password' && 'Enter your password. No IMAP server details required.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4" data-testid="add-account-email-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            {email.includes('@') && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                {clientProvider ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span>
                      Detected <span className="font-medium text-foreground">{clientProvider.name}</span>
                      {clientProvider.oauthSupported && ' — one-click sign-in available.'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <span>We will look up your mail server automatically on the next step.</span>
                  </>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!email.includes('@') || discovering}>
              {discovering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Looking up your mail server…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        )}

        {step === 'oauth-offer' && clientProvider?.oauthSupported && (
          <div className="space-y-4">
            {discovered?.oauthUnavailable ? (
              <>
                <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold">
                          One-click sign-in isn&apos;t set up for {clientProvider.name} yet
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {discovered.oauthUnavailableReason ??
                            'The server administrator needs to configure OAuth credentials.'}
                        </p>
                      </div>
                    </div>
                    {discovered.oauthProvider === 'outlook' && (
                      <p className="text-xs text-muted-foreground pl-8">
                        Microsoft 365 also blocks password IMAP login, so connecting this
                        account will not work until OAuth is configured.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {discovered.oauthProvider === 'outlook' ? (
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="text-sm text-primary hover:underline w-full text-center"
                  >
                    ← Use a different email
                  </button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await runDiscovery(email, { skipHostedOAuthPivot: true });
                    }}
                    className="w-full"
                  >
                    Try IMAP with an app password anyway
                  </Button>
                )}
              </>
            ) : (
              <>
                <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-xl">
                        {clientProvider.icon || '📧'}
                      </div>
                      <div>
                        <h3 className="font-semibold">Recommended: one-click connect</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Sign in with {clientProvider.name} — no password needed.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button
                  onClick={() => handleOAuthConnect(oauthIdFromProvider(clientProvider))}
                  className="w-full h-12"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Connect with {clientProvider.name}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={async () => {
                    await runDiscovery(email, { skipHostedOAuthPivot: true });
                  }}
                  className="w-full"
                >
                  Use app password instead
                </Button>
              </>
            )}

            <button
              type="button"
              onClick={() => setStep('email')}
              className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            >
              ← Use a different email
            </button>
          </div>
        )}

        {step === 'password' && (
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                {providerIcon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{email}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {discovering ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Looking up mail server…
                    </>
                  ) : discovered ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      {providerName} · {discovered.imap.host}
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                      {providerName}
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-xs text-primary hover:underline"
              >
                Change
              </button>
            </div>

            {discoverError && !discovered && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="pt-4 text-xs text-amber-800 dark:text-amber-200">
                  {discoverError}
                </CardContent>
              </Card>
            )}

            {appPasswordRequired && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="pt-4">
                  <h4 className="font-semibold text-sm mb-2">App password required</h4>
                  <p className="text-xs text-muted-foreground mb-3">{appPasswordInstructions}</p>
                  {appPasswordUrl && (
                    <a
                      href={appPasswordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Create app password
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">{appPasswordRequired ? 'App password' : 'Password'}</Label>
              <Input
                id="password"
                type="password"
                placeholder={appPasswordRequired ? 'Paste your app password' : 'Your email password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                autoComplete="current-password"
              />
            </div>

            {connectError && (
              <div
                className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{connectError}</span>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showManual ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showManual ? 'Hide advanced settings' : 'Advanced: server settings'}
              </button>
            </div>

            {showManual && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/40">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="imapHost" className="text-xs">
                      IMAP server
                    </Label>
                    <Input
                      id="imapHost"
                      placeholder="imap.example.com"
                      value={manual.imapHost}
                      onChange={(e) => setManual((s) => ({ ...s, imapHost: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="imapPort" className="text-xs">
                      Port
                    </Label>
                    <Input
                      id="imapPort"
                      value={manual.imapPort}
                      onChange={(e) => setManual((s) => ({ ...s, imapPort: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtpHost" className="text-xs">
                      SMTP server
                    </Label>
                    <Input
                      id="smtpHost"
                      placeholder="smtp.example.com"
                      value={manual.smtpHost}
                      onChange={(e) => setManual((s) => ({ ...s, smtpHost: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtpPort" className="text-xs">
                      Port
                    </Label>
                    <Input
                      id="smtpPort"
                      value={manual.smtpPort}
                      onChange={(e) => setManual((s) => ({ ...s, smtpPort: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={connecting || !password || discovering}
            >
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Connect account'
              )}
            </Button>

            {clientProvider?.oauthSupported && (
              <button
                type="button"
                onClick={() => setStep('oauth-offer')}
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
              >
                ← Back to one-click sign-in
              </button>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

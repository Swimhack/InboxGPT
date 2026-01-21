'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Loader2,
  Mail,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { detectProvider, type ProviderConfig } from '@/lib/email/provider-config';

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountAdded?: () => void;
}

type Step = 'email' | 'connect' | 'password';

export function AddAccountDialog({
  open,
  onOpenChange,
  onAccountAdded,
}: AddAccountDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<ProviderConfig | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualSettings, setManualSettings] = useState({
    imapHost: '',
    imapPort: '993',
    smtpHost: '',
    smtpPort: '587',
  });

  // Detect provider when email changes
  useEffect(() => {
    if (email.includes('@')) {
      const provider = detectProvider(email);
      setDetectedProvider(provider);

      // Pre-fill manual settings if provider detected
      if (provider) {
        setManualSettings({
          imapHost: provider.imap.host,
          imapPort: String(provider.imap.port),
          smtpHost: provider.smtp.host,
          smtpPort: String(provider.smtp.port),
        });
      }
    } else {
      setDetectedProvider(null);
    }
  }, [email]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep('email');
      setEmail('');
      setPassword('');
      setDetectedProvider(null);
      setShowManual(false);
      setManualSettings({
        imapHost: '',
        imapPort: '993',
        smtpHost: '',
        smtpPort: '587',
      });
    }
  }, [open]);

  const handleEmailSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;

    if (detectedProvider?.oauthSupported) {
      setStep('connect');
    } else if (detectedProvider) {
      setStep('password');
    } else {
      // Unknown provider - show manual form
      setShowManual(true);
      setStep('password');
    }
  }, [email, detectedProvider]);

  const handleOAuthConnect = (provider: 'gmail' | 'outlook') => {
    setIsLoading(true);
    // Store email in session storage so we can use it after OAuth
    sessionStorage.setItem('pendingEmailConnection', email);
    window.location.href = `/api/auth/oauth/${provider}`;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: 'imap',
          email,
          password,
          imapHost: detectedProvider?.imap.host || manualSettings.imapHost,
          imapPort: detectedProvider?.imap.port || parseInt(manualSettings.imapPort),
          smtpHost: detectedProvider?.smtp.host || manualSettings.smtpHost,
          smtpPort: detectedProvider?.smtp.port || parseInt(manualSettings.smtpPort),
        }),
      });

      if (res.ok) {
        onOpenChange(false);
        toast({
          title: 'Account connected!',
          description: 'Your emails will start syncing shortly.',
        });

        if (onAccountAdded) {
          onAccountAdded();
        } else {
          window.location.reload();
        }
      } else {
        const data = await res.json();
        toast({
          title: 'Connection failed',
          description: data.error || 'Please check your email and password.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Connection failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'email' && 'Add Email Account'}
            {step === 'connect' && `Connect ${detectedProvider?.name}`}
            {step === 'password' && `Sign in to ${detectedProvider?.name || 'your email'}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'email' && 'Enter your email address to get started'}
            {step === 'connect' && 'Choose how you want to connect'}
            {step === 'password' && 'Enter your password to connect'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Enter Email */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            {/* Provider detection feedback */}
            {email.includes('@') && (
              <div className="flex items-center gap-2 text-sm">
                {detectedProvider ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-muted-foreground">
                      Detected: <span className="font-medium text-foreground">{detectedProvider.name}</span>
                      {detectedProvider.oauthSupported && (
                        <span className="text-green-600 ml-1">(One-click connect available!)</span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">
                      Unknown provider - you&apos;ll need to enter server settings manually
                    </span>
                  </>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!email.includes('@')}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        )}

        {/* Step 2: OAuth Connect (for Gmail/Outlook) */}
        {step === 'connect' && detectedProvider?.oauthSupported && (
          <div className="space-y-4">
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-xl">
                    {detectedProvider.icon || '📧'}
                  </div>
                  <div>
                    <h3 className="font-semibold">Recommended: One-click connect</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Securely connect with your {detectedProvider.name} account. No password needed.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() =>
                handleOAuthConnect(
                  detectedProvider.domains.includes('gmail.com') ? 'gmail' : 'outlook'
                )
              }
              className="w-full h-12"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Connect with {detectedProvider.name}
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
              onClick={() => setStep('password')}
              className="w-full"
            >
              Use App Password instead
            </Button>

            <button
              type="button"
              onClick={() => setStep('email')}
              className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            >
              ← Use a different email
            </button>
          </div>
        )}

        {/* Step 3: Password Entry */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {/* Show email being connected */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                {detectedProvider?.icon || '📧'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{email}</p>
                <p className="text-xs text-muted-foreground">
                  {detectedProvider?.name || 'Custom IMAP'}
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

            {/* App Password Instructions */}
            {detectedProvider?.appPasswordRequired && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="pt-4">
                  <h4 className="font-semibold text-sm mb-2">
                    App Password Required
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {detectedProvider.appPasswordInstructions}
                  </p>
                  {detectedProvider.appPasswordUrl && (
                    <a
                      href={detectedProvider.appPasswordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Create App Password
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {detectedProvider?.appPasswordRequired ? 'App Password' : 'Password'}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={
                  detectedProvider?.appPasswordRequired
                    ? 'Paste your app password here'
                    : 'Your email password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* Manual settings (collapsed by default for known providers) */}
            {(!detectedProvider || showManual) && (
              <div className="space-y-4">
                {detectedProvider && (
                  <button
                    type="button"
                    onClick={() => setShowManual(!showManual)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {showManual ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    {showManual ? 'Hide' : 'Show'} server settings
                  </button>
                )}

                {(!detectedProvider || showManual) && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="imapHost" className="text-xs">
                          IMAP Server
                        </Label>
                        <Input
                          id="imapHost"
                          placeholder="imap.example.com"
                          value={manualSettings.imapHost}
                          onChange={(e) =>
                            setManualSettings((s) => ({
                              ...s,
                              imapHost: e.target.value,
                            }))
                          }
                          required
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imapPort" className="text-xs">
                          Port
                        </Label>
                        <Input
                          id="imapPort"
                          placeholder="993"
                          value={manualSettings.imapPort}
                          onChange={(e) =>
                            setManualSettings((s) => ({
                              ...s,
                              imapPort: e.target.value,
                            }))
                          }
                          required
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="smtpHost" className="text-xs">
                          SMTP Server
                        </Label>
                        <Input
                          id="smtpHost"
                          placeholder="smtp.example.com"
                          value={manualSettings.smtpHost}
                          onChange={(e) =>
                            setManualSettings((s) => ({
                              ...s,
                              smtpHost: e.target.value,
                            }))
                          }
                          required
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpPort" className="text-xs">
                          Port
                        </Label>
                        <Input
                          id="smtpPort"
                          placeholder="587"
                          value={manualSettings.smtpPort}
                          onChange={(e) =>
                            setManualSettings((s) => ({
                              ...s,
                              smtpPort: e.target.value,
                            }))
                          }
                          required
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Show toggle for known providers */}
            {detectedProvider && !showManual && (
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3 w-3" />
                Show server settings
              </button>
            )}

            <Button type="submit" className="w-full" disabled={isLoading || !password}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Account'
              )}
            </Button>

            {detectedProvider?.oauthSupported && (
              <button
                type="button"
                onClick={() => setStep('connect')}
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
              >
                ← Back to one-click connect
              </button>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

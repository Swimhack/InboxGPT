'use client';

import { apiUrl } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Mail,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { detectProvider, type ProviderConfig } from '@/lib/email/provider-config';

export default function ConnectEmailPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
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

  // Update progress bar
  useEffect(() => {
    const progress = document.getElementById('onboarding-progress');
    if (progress) progress.style.width = '50%';
  }, []);

  // Detect provider when email changes
  useEffect(() => {
    if (email.includes('@')) {
      const provider = detectProvider(email);
      setDetectedProvider(provider);
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

  const handleOAuthConnect = (provider: 'gmail' | 'outlook') => {
    setIsLoading(true);
    sessionStorage.setItem('pendingEmailConnection', email);
    sessionStorage.setItem('onboardingInProgress', 'true');
    window.location.href = `/api/auth/oauth/${provider}`;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(apiUrl('/api/accounts'), {
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
        router.push('/complete');
      } else {
        const data = await res.json();
        toast({
          title: 'Connection failed',
          description: data.error || 'Please check your email and password.',
          variant: 'destructive',
        });
        setIsLoading(false);
      }
    } catch {
      toast({
        title: 'Connection failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const showPasswordForm = email.includes('@') && !detectedProvider?.oauthSupported;
  const showOAuthOption = email.includes('@') && detectedProvider?.oauthSupported;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={() => router.push('/welcome')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Connect Your Email</CardTitle>
          <CardDescription>
            Enter your email address to connect your first account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Input */}
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
            />
            {/* Provider detection feedback */}
            {email.includes('@') && (
              <div className="flex items-center gap-2 text-sm">
                {detectedProvider ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-muted-foreground">
                      Detected: <span className="font-medium text-foreground">{detectedProvider.name}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">
                      We&apos;ll need server settings for this provider
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* OAuth Option for Gmail/Outlook */}
          {showOAuthOption && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-lg">
                    {detectedProvider?.icon || '📧'}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">One-Click Connect</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Securely connect with your {detectedProvider?.name} account. No password needed.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={() =>
                  handleOAuthConnect(
                    detectedProvider?.domains.includes('gmail.com') ? 'gmail' : 'outlook'
                  )
                }
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Connect with {detectedProvider?.name}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or use password</span>
                </div>
              </div>
            </div>
          )}

          {/* Password Form */}
          {(showPasswordForm || showOAuthOption) && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {/* App Password Instructions */}
              {detectedProvider?.appPasswordRequired && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <h4 className="font-semibold text-sm mb-2">App Password Required</h4>
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
                </div>
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
                      ? 'Paste your app password'
                      : 'Your email password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {/* Manual settings for unknown providers */}
              {(!detectedProvider || showManual) && (
                <div className="space-y-4">
                  {detectedProvider && (
                    <button
                      type="button"
                      onClick={() => setShowManual(!showManual)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className="h-3 w-3" />
                      {showManual ? 'Hide' : 'Show'} server settings
                    </button>
                  )}

                  {(!detectedProvider || showManual) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="imapHost" className="text-xs">IMAP Server</Label>
                        <Input
                          id="imapHost"
                          placeholder="imap.example.com"
                          value={manualSettings.imapHost}
                          onChange={(e) => setManualSettings((s) => ({ ...s, imapHost: e.target.value }))}
                          required={!detectedProvider}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imapPort" className="text-xs">Port</Label>
                        <Input
                          id="imapPort"
                          placeholder="993"
                          value={manualSettings.imapPort}
                          onChange={(e) => setManualSettings((s) => ({ ...s, imapPort: e.target.value }))}
                          required={!detectedProvider}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpHost" className="text-xs">SMTP Server</Label>
                        <Input
                          id="smtpHost"
                          placeholder="smtp.example.com"
                          value={manualSettings.smtpHost}
                          onChange={(e) => setManualSettings((s) => ({ ...s, smtpHost: e.target.value }))}
                          required={!detectedProvider}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpPort" className="text-xs">Port</Label>
                        <Input
                          id="smtpPort"
                          placeholder="587"
                          value={manualSettings.smtpPort}
                          onChange={(e) => setManualSettings((s) => ({ ...s, smtpPort: e.target.value }))}
                          required={!detectedProvider}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !email || !password}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Account'
                )}
              </Button>
            </form>
          )}

          {/* Show button to proceed if email not entered */}
          {!email.includes('@') && (
            <p className="text-sm text-center text-muted-foreground">
              Enter your email address to see connection options
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

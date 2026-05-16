'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '@/lib/utils';
import { ProviderPicker, ALL_PROVIDERS, type PickedProvider } from './provider-picker';
import {
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Shield,
  Zap,
} from 'lucide-react';

type WizardStep = 'pick' | 'configure' | 'testing' | 'success';

interface TestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  hint?: string;
  raw?: string;
}

interface AIMessage {
  role: 'assistant';
  text: string;
}

// AI guidance text per provider/step — feels conversational and smart
function getAIGuidance(provider: PickedProvider | null, step: WizardStep, testResult?: TestResult): AIMessage {
  if (step === 'pick') {
    return { role: 'assistant', text: "Choose your email provider below. I'll automatically configure all the server settings for you — no technical knowledge needed." };
  }

  if (step === 'testing') {
    return { role: 'assistant', text: "Testing your connection now... I'm verifying your credentials with the mail server." };
  }

  if (step === 'success') {
    return { role: 'assistant', text: `Your ${provider?.name} account is connected and syncing. New emails will appear in your inbox within moments.` };
  }

  if (step === 'configure' && provider) {
    if (provider.id === 'gmail') {
      return { role: 'assistant', text: "Gmail blocks regular passwords for third-party apps — you need an App Password instead. It takes 30 seconds to create one: go to your Google Account → Security → 2-Step Verification → App passwords. I've added the link below." };
    }
    if (provider.id === 'icloud') {
      return { role: 'assistant', text: "Apple requires app-specific passwords for third-party email clients. Visit appleid.apple.com → Sign-In and Security → App-Specific Passwords. Generate one labeled 'InboxGPT' and paste it below." };
    }
    if (provider.id === 'yahoo') {
      return { role: 'assistant', text: "Yahoo uses App Passwords for third-party clients. Head to Yahoo Account → Security → Generate app password. Select 'Other App' and use the 16-character code it gives you." };
    }
    if (provider.id === 'protonmail') {
      return { role: 'assistant', text: "ProtonMail uses end-to-end encryption, so IMAP requires the ProtonMail Bridge app running on your device to decrypt messages locally. Download it first, then come back here with the Bridge credentials it provides." };
    }
    if (provider.id === 'custom') {
      return { role: 'assistant', text: "No worries — enter your email address, password, and I'll need the IMAP server details from your email host's documentation. Port 993 with SSL is the standard." };
    }
    if (provider.appPasswordRequired) {
      return { role: 'assistant', text: `${provider.name} requires an App Password for third-party access. ${provider.appPasswordInstructions || 'Create one in your account security settings.'}` };
    }
    return { role: 'assistant', text: `Enter your ${provider.name} credentials below. I've already filled in the correct server settings for you.` };
  }

  // Test result feedback
  if (testResult && !testResult.success) {
    if (testResult.hint === 'app_password') {
      return { role: 'assistant', text: `Authentication failed — this usually means your regular password won't work here. ${provider?.appPasswordRequired ? 'Make sure you created an App Password (not your regular login password).' : 'Double-check your password and try again.'}` };
    }
    if (testResult.hint === 'connection') {
      return { role: 'assistant', text: "Couldn't reach the mail server — the host or port might be wrong. If you're using a custom server, double-check the settings with your email provider's documentation." };
    }
    if (testResult.hint === 'ssl') {
      return { role: 'assistant', text: "There's an SSL/TLS mismatch. Try toggling the 'Use SSL' option — port 993 requires SSL on, while port 143 uses STARTTLS." };
    }
    return { role: 'assistant', text: `Connection failed: ${testResult.message} — check your credentials and server settings, then try again.` };
  }

  return { role: 'assistant', text: "Enter your credentials and I'll test the connection before saving anything." };
}

interface SetupWizardProps {
  onComplete: () => void;
  onCancel?: () => void;
  onUpgradeRequired?: () => void;
  compact?: boolean; // Show in dialog mode vs full-screen
}

export function SetupWizard({ onComplete, onCancel, onUpgradeRequired, compact = false }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('pick');
  const [provider, setProvider] = useState<PickedProvider | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveError, setSaveError] = useState('');

  // Auto-detect provider from email
  useEffect(() => {
    if (!email.includes('@')) return;
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || provider?.id === 'custom') return;

    const matched = ALL_PROVIDERS.find(
      (p) => p.id !== 'custom' && (
        (p.id === 'gmail' && (domain === 'gmail.com' || domain === 'googlemail.com')) ||
        (p.id === 'outlook' && ['outlook.com','hotmail.com','live.com','msn.com'].includes(domain)) ||
        (p.id === 'yahoo' && (domain.startsWith('yahoo.') || domain === 'ymail.com')) ||
        (p.id === 'icloud' && ['icloud.com','me.com','mac.com'].includes(domain)) ||
        (p.id === 'protonmail' && ['protonmail.com','proton.me','pm.me'].includes(domain)) ||
        (p.id === 'zoho' && ['zoho.com','zohomail.com'].includes(domain)) ||
        (p.id === 'fastmail' && ['fastmail.com','fastmail.fm'].includes(domain)) ||
        (p.id === 'aol' && ['aol.com','aim.com'].includes(domain))
      )
    );

    if (matched && matched.id !== provider?.id) {
      setProvider(matched);
      setImapHost(matched.imap.host);
      setImapPort(matched.imap.port);
      setSmtpHost(matched.smtp.host);
      setSmtpPort(matched.smtp.port);
    }
  }, [email, provider]);

  const handlePickProvider = useCallback((picked: PickedProvider) => {
    setProvider(picked);
    setImapHost(picked.imap.host);
    setImapPort(picked.imap.port);
    setSmtpHost(picked.smtp.host);
    setSmtpPort(picked.smtp.port);
    setTestResult(null);
    setSaveError('');
    setStep('configure');
  }, []);

  const handleTest = useCallback(async () => {
    if (!email || !password || !imapHost) return;
    setIsLoading(true);
    setStep('testing');
    setTestResult(null);

    try {
      const res = await fetch(apiUrl('/api/accounts/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, imapHost, imapPort }),
      });
      const data = await res.json();
      setTestResult(data);

      if (data.success) {
        // Auto-save after successful test
        await handleSave();
      } else {
        setStep('configure');
      }
    } catch {
      setTestResult({ success: false, latencyMs: 0, message: 'Network error — check your connection.', hint: 'connection' });
      setStep('configure');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, imapHost, imapPort]);

  const handleSave = useCallback(async () => {
    setSaveError('');
    try {
      const res = await fetch(apiUrl('/api/accounts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: 'imap',
          email,
          password,
          imapHost,
          imapPort: String(imapPort),
          smtpHost,
          smtpPort: String(smtpPort),
        }),
      });

      if (res.ok) {
        setStep('success');
        // Auto-trigger sync
        const { accountId } = await res.json();
        if (accountId) {
          await fetch(apiUrl('/api/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, type: 'full' }),
          }).catch(() => {}); // Non-fatal
        }
        setTimeout(onComplete, 1800);
      } else {
        const data = await res.json();
        if (res.status === 403 && data.upgrade && onUpgradeRequired) {
          onUpgradeRequired();
          return;
        }
        setSaveError(data.error || 'Failed to save account.');
        setStep('configure');
      }
    } catch {
      setSaveError('Failed to connect — please try again.');
      setStep('configure');
    }
  }, [email, password, imapHost, imapPort, smtpHost, smtpPort, onComplete]);

  const aiMsg = getAIGuidance(
    provider,
    step,
    testResult && !testResult.success ? testResult : undefined
  );

  const wrapperClass = compact
    ? 'w-full'
    : 'min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center p-4';

  const cardClass = compact
    ? 'w-full'
    : 'w-full max-w-lg bg-white dark:bg-card rounded-3xl shadow-2xl shadow-slate-200/60 dark:shadow-slate-900/60 overflow-hidden';

  return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        {/* Header */}
        <div className="px-6 pt-7 pb-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            {step !== 'pick' && step !== 'success' ? (
              <button
                onClick={() => { setStep('pick'); setTestResult(null); }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : <div />}
            {onCancel && step !== 'success' && (
              <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            )}
          </div>

          <div className="flex items-start gap-3">
            {provider && step !== 'pick' ? (
              <div className="w-11 h-11 rounded-xl bg-white shadow border border-gray-100 flex items-center justify-center shrink-0">
                {provider.logo}
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-blue-500" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                {step === 'pick' && 'Connect Email Account'}
                {step === 'configure' && `Connect ${provider?.name}`}
                {step === 'testing' && 'Verifying Connection'}
                {step === 'success' && 'Account Connected!'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {step === 'pick' && 'Step 1 of 2 — Choose your provider'}
                {step === 'configure' && 'Step 2 of 2 — Enter credentials'}
                {step === 'testing' && 'Just a moment...'}
                {step === 'success' && 'Syncing your emails now'}
              </p>
            </div>
          </div>
        </div>

        {/* AI Guide */}
        <div className="mx-6 mt-4 mb-2 flex items-start gap-2.5 p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100/80">
          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="text-sm text-blue-800 leading-relaxed">{aiMsg.text}</p>
        </div>

        <div className="px-6 pb-7 pt-3">
          {/* STEP: PICK */}
          {step === 'pick' && (
            <ProviderPicker onSelect={handlePickProvider} />
          )}

          {/* STEP: CONFIGURE */}
          {step === 'configure' && provider && (
            <div className="space-y-4 mt-2">
              {/* Email field */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Email Address</label>
                <input
                  type="email"
                  placeholder={`you@${provider.id === 'gmail' ? 'gmail.com' : provider.id === 'icloud' ? 'icloud.com' : 'example.com'}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all bg-gray-50/50"
                />
              </div>

              {/* Password / App Password field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    {provider.appPasswordRequired ? 'App Password' : 'Password'}
                  </label>
                  {provider.appPasswordUrl && (
                    <a
                      href={provider.appPasswordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      Create App Password <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={provider.appPasswordRequired ? 'Paste app password here' : 'Your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all bg-gray-50/50"
                />
              </div>

              {/* Test result error inline */}
              {testResult && !testResult.success && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{testResult.message}</p>
                </div>
              )}

              {saveError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              )}

              {/* Advanced server settings toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {provider.id === 'custom' ? 'Server settings (required)' : 'Advanced server settings'}
                </button>

                {(showAdvanced || provider.id === 'custom') && (
                  <div className="mt-3 p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium text-gray-500">IMAP Host</label>
                        <input
                          type="text"
                          placeholder="imap.example.com"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">Port</label>
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-medium text-gray-500">SMTP Host</label>
                        <input
                          type="text"
                          placeholder="smtp.example.com"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">Port</label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Trust / security note */}
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Shield className="w-3.5 h-3.5 text-gray-300" />
                Your credentials are encrypted before storage and never logged.
              </div>

              {/* Connect button */}
              <button
                onClick={handleTest}
                disabled={!email || !password || (provider.id === 'custom' && !imapHost)}
                className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-200 hover:shadow-blue-300"
              >
                Test &amp; Connect
              </button>
            </div>
          )}

          {/* STEP: TESTING */}
          {step === 'testing' && (
            <div className="flex flex-col items-center py-10 gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <Zap className="w-3 h-3 text-blue-500" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-gray-700">Connecting to {provider?.name}</p>
                <p className="text-xs text-gray-400">{imapHost}:{imapPort}</p>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[0,1,2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* STEP: SUCCESS */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-10 gap-5">
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-gray-800">{email}</p>
                <p className="text-xs text-green-600 font-medium">Connected · Syncing now</p>
              </div>
              <div className="text-xs text-gray-400">Loading your inbox...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

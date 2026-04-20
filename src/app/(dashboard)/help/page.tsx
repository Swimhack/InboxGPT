'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChevronDown,
  ChevronUp,
  Mail,
  Key,
  Sparkles,
  Shield,
  RefreshCw,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { AIFeatureCard, AIPrivacyNote } from '@/components/ai/ai-explainer';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
}

const faqs: Record<string, FAQItem[]> = {
  'Getting Started': [
    {
      question: 'How do I connect my Gmail account?',
      answer: (
        <ol className="list-decimal ml-4 space-y-2">
          <li>Go to <Link href="/accounts" className="text-primary hover:underline">Accounts</Link> and click "Add Account"</li>
          <li>Enter your Gmail email address</li>
          <li>Click "Connect with Gmail" for one-click setup</li>
          <li>Sign in with your Google account and grant permission</li>
          <li>Your emails will start syncing automatically</li>
        </ol>
      ),
    },
    {
      question: 'How do I connect my Outlook account?',
      answer: (
        <ol className="list-decimal ml-4 space-y-2">
          <li>Go to <Link href="/accounts" className="text-primary hover:underline">Accounts</Link> and click "Add Account"</li>
          <li>Enter your Outlook email address</li>
          <li>Click "Connect with Outlook" for one-click setup</li>
          <li>Sign in with your Microsoft account and grant permission</li>
          <li>Your emails will start syncing automatically</li>
        </ol>
      ),
    },
    {
      question: 'Can I connect Yahoo, iCloud, or other email providers?',
      answer: (
        <div className="space-y-2">
          <p>Yes! InboxGPT supports most email providers. For providers like Yahoo, iCloud, and others, you&apos;ll need to use an App Password.</p>
          <p>When you enter your email, we&apos;ll detect your provider and show you specific instructions for creating an App Password.</p>
        </div>
      ),
    },
  ],
  'App Passwords': [
    {
      question: 'What is an App Password?',
      answer: (
        <div className="space-y-2">
          <p>An App Password is a special password generated specifically for apps like InboxGPT to access your email. It&apos;s more secure than using your regular password because:</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>It works even with 2-factor authentication enabled</li>
            <li>You can revoke it anytime without changing your main password</li>
            <li>It only grants email access, not full account access</li>
          </ul>
        </div>
      ),
    },
    {
      question: 'How do I create a Gmail App Password?',
      answer: (
        <ol className="list-decimal ml-4 space-y-2">
          <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Google App Passwords <ExternalLink className="h-3 w-3" /></a></li>
          <li>Sign in if prompted</li>
          <li>Select "Mail" for the app and "Other" for the device</li>
          <li>Enter "InboxGPT" as the name</li>
          <li>Click "Generate" and copy the 16-character password</li>
          <li>Paste this password in InboxGPT instead of your regular password</li>
        </ol>
      ),
    },
    {
      question: 'How do I create a Yahoo App Password?',
      answer: (
        <ol className="list-decimal ml-4 space-y-2">
          <li>Go to <a href="https://login.yahoo.com/account/security/app-passwords" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Yahoo App Passwords <ExternalLink className="h-3 w-3" /></a></li>
          <li>Sign in if prompted</li>
          <li>Click "Generate app password"</li>
          <li>Select "Other App" and enter "InboxGPT"</li>
          <li>Copy the generated password</li>
          <li>Paste this password in InboxGPT</li>
        </ol>
      ),
    },
    {
      question: 'How do I create an iCloud App Password?',
      answer: (
        <ol className="list-decimal ml-4 space-y-2">
          <li>Go to <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Apple ID Settings <ExternalLink className="h-3 w-3" /></a></li>
          <li>Sign in with your Apple ID</li>
          <li>Go to "Sign-In and Security" → "App-Specific Passwords"</li>
          <li>Click the + button and enter "InboxGPT"</li>
          <li>Copy the generated password</li>
          <li>Paste this password in InboxGPT</li>
        </ol>
      ),
    },
  ],
  'AI Features': [
    {
      question: 'What does the AI do with my emails?',
      answer: (
        <div className="space-y-3">
          <p>InboxGPT uses AI to help you manage your inbox more efficiently:</p>
          <div className="grid gap-3">
            <AIFeatureCard feature="summary" />
            <AIFeatureCard feature="category" />
            <AIFeatureCard feature="priority" />
            <AIFeatureCard feature="replies" />
          </div>
        </div>
      ),
    },
    {
      question: 'Is my email data safe with AI processing?',
      answer: <AIPrivacyNote />,
    },
    {
      question: 'Can I disable AI features?',
      answer: 'Yes, you can disable AI features in Settings. Your emails will still sync and be available, but without automatic summaries, categorization, or reply suggestions.',
    },
    {
      question: 'Why do some emails say "AI analyzing"?',
      answer: 'When new emails arrive, they\'re queued for AI processing. This usually takes a few seconds. Once processing is complete, you\'ll see the summary, category, and suggested replies.',
    },
  ],
  'Syncing & Troubleshooting': [
    {
      question: 'How often do emails sync?',
      answer: 'InboxGPT syncs your emails every few minutes automatically. You can also click the sync button to trigger an immediate sync.',
    },
    {
      question: 'My emails aren\'t syncing. What should I do?',
      answer: (
        <ol className="list-decimal ml-4 space-y-2">
          <li>Check the status bar at the top - it shows if syncing is in progress</li>
          <li>Go to <Link href="/accounts" className="text-primary hover:underline">Accounts</Link> to check for any error messages</li>
          <li>If you see an authentication error, your password or app password may have changed</li>
          <li>Try disconnecting and reconnecting your account</li>
        </ol>
      ),
    },
    {
      question: 'I\'m getting an "authentication failed" error',
      answer: (
        <div className="space-y-2">
          <p>This usually means:</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Your password or app password is incorrect</li>
            <li>Your app password may have been revoked</li>
            <li>You need to use an app password instead of your regular password</li>
          </ul>
          <p>Try creating a new app password and reconnecting your account.</p>
        </div>
      ),
    },
  ],
  'Privacy & Security': [
    {
      question: 'How is my data stored?',
      answer: (
        <div className="space-y-2">
          <p>InboxGPT takes your privacy seriously:</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>All email credentials are encrypted with AES-256</li>
            <li>Your data is stored locally (you control where)</li>
            <li>Emails are only sent to AI providers for processing, never stored by them</li>
            <li>You can delete your account and all data at any time</li>
          </ul>
        </div>
      ),
    },
    {
      question: 'Can I self-host InboxGPT?',
      answer: 'Yes! InboxGPT is designed to be self-hosted. You can run it on your own server and keep all your data under your control.',
    },
  ],
};

function FAQSection({ title, items }: { title: string; items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="border rounded-lg">
            <button
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              <span className="font-medium">{item.question}</span>
              {openIndex === index ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {openIndex === index && (
              <div className="px-4 pb-4 text-sm text-muted-foreground">
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            Help & FAQ
          </h1>
          <p className="text-muted-foreground mt-1">
            Find answers to common questions about InboxGPT
          </p>
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Help</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link
                href="/accounts"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Mail className="h-6 w-6 text-primary mb-2" />
                <span className="text-sm font-medium">Add Account</span>
              </Link>
              <Link
                href="#app-passwords"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Key className="h-6 w-6 text-primary mb-2" />
                <span className="text-sm font-medium">App Passwords</span>
              </Link>
              <Link
                href="#ai-features"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Sparkles className="h-6 w-6 text-primary mb-2" />
                <span className="text-sm font-medium">AI Features</span>
              </Link>
              <Link
                href="#privacy-security"
                className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Shield className="h-6 w-6 text-primary mb-2" />
                <span className="text-sm font-medium">Privacy</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* FAQ Sections */}
        <div className="space-y-8">
          <FAQSection title="Getting Started" items={faqs['Getting Started']} />
          <div id="app-passwords">
            <FAQSection title="App Passwords" items={faqs['App Passwords']} />
          </div>
          <div id="ai-features">
            <FAQSection title="AI Features" items={faqs['AI Features']} />
          </div>
          <FAQSection title="Syncing & Troubleshooting" items={faqs['Syncing & Troubleshooting']} />
          <div id="privacy-security">
            <FAQSection title="Privacy & Security" items={faqs['Privacy & Security']} />
          </div>
        </div>

        {/* Still need help */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Still need help?</h3>
              <p className="text-sm text-muted-foreground">
                If you can&apos;t find what you&apos;re looking for, try syncing your account again or check for error messages in your account settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

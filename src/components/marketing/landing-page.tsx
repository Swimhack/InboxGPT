import Link from 'next/link';
import { Mail, Search, Sparkles, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero */}
      <header className="max-w-4xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">InboxGPT</span>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          All your email.<br />One inbox.
        </h1>
        <p className="text-xl text-muted-foreground max-w-lg mx-auto mb-8">
          Connect Gmail, Outlook, and IMAP accounts in one place. Free forever for your first account.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Get Started Free
          <ArrowRight className="h-5 w-5" />
        </Link>
      </header>

      {/* Value Props */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Connect Everything</h3>
            <p className="text-sm text-muted-foreground">
              Gmail, Outlook, any IMAP email — all in one unified view. No more switching between apps.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Smart Organization</h3>
            <p className="text-sm text-muted-foreground">
              Search across all accounts, star, archive, and filter. Find any email in seconds.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">AI That Works For You</h3>
            <p className="text-sm text-muted-foreground">
              Daily briefs, auto-categorization, and suggested replies. Let AI handle the noise.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <h2 className="text-3xl font-bold text-center mb-10">Simple pricing</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Free */}
          <div className="border rounded-xl p-6 bg-white dark:bg-slate-900">
            <h3 className="font-semibold text-lg">Free</h3>
            <div className="mt-2 mb-4">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-muted-foreground">/forever</span>
            </div>
            <ul className="space-y-2 text-sm mb-6">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 1 email account</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 500 messages/month</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Unified inbox</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Search, star, archive</li>
            </ul>
            <Link
              href="/register"
              className="block w-full text-center border border-primary text-primary px-4 py-2 rounded-lg font-medium hover:bg-primary/5 transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro */}
          <div className="border-2 border-primary rounded-xl p-6 bg-white dark:bg-slate-900 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
              Recommended
            </div>
            <h3 className="font-semibold text-lg">Pro</h3>
            <div className="mt-2 mb-4">
              <span className="text-4xl font-bold">$29</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-2 text-sm mb-6">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Up to 5 email accounts</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 10,000 messages/month</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI daily brief</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI categorization &amp; priority</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI suggested replies</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI email summaries</li>
            </ul>
            <Link
              href="/register"
              className="block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Start Free, Upgrade Anytime
            </Link>
          </div>

          {/* Business */}
          <div className="border rounded-xl p-6 bg-white dark:bg-slate-900">
            <h3 className="font-semibold text-lg">Business</h3>
            <div className="mt-2 mb-4">
              <span className="text-4xl font-bold">$99</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-2 text-sm mb-6">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Unlimited accounts &amp; messages</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Everything in Pro</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Team &amp; shared inbox</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Priority support &amp; onboarding</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Self-hosting option</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Security review &amp; DPA</li>
            </ul>
            <Link
              href="/register"
              className="block w-full text-center border border-primary text-primary px-4 py-2 rounded-lg font-medium hover:bg-primary/5 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          AES-256 encryption. Cancel anytime. No credit card required for free tier.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>© 2026 StricklandAI</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

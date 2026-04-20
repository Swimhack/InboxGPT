'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2, Mail, Send } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/stripe/plans';

const PLAN_ORDER: PlanId[] = ['free', 'pro', 'business'];

const SERVICES = [
  'Email inbox management',
  'Multi-channel setup (Gmail + Outlook)',
  'AI triage & auto-reply',
  'Team/shared inbox',
  'Enterprise / custom integration',
  'Other',
];

const BUDGETS = ['< $100/mo', '$100–$500/mo', '$500–$2,000/mo', '$2,000+/mo', 'Not sure yet'];

type QuoteForm = {
  name: string;
  email: string;
  company: string;
  service: string;
  budget: string;
  description: string;
};

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [quoteForm, setQuoteForm] = useState<QuoteForm>({
    name: '',
    email: '',
    company: '',
    service: '',
    budget: '',
    description: '',
  });
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleUpgrade = async (planId: PlanId) => {
    if (planId === 'free') {
      router.push('/register');
      return;
    }
    setLoading(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        // Not logged in or Stripe not configured — redirect to register
        router.push('/register');
      }
    } catch {
      router.push('/register');
    } finally {
      setLoading(null);
    }
  };

  const handleQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuoteStatus('sending');
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteForm),
      });
      if (res.ok) {
        setQuoteStatus('sent');
      } else {
        setQuoteStatus('error');
      }
    } catch {
      setQuoteStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">InboxGPT</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Start free. Upgrade when you need more channels, AI features, or team members.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId];
            const isPro = planId === 'pro';
            return (
              <Card
                key={planId}
                className={`relative flex flex-col ${isPro ? 'border-primary shadow-lg scale-105' : ''}`}
              >
                {isPro && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Most popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-4xl font-bold">
                      {plan.price === 0 ? '$0' : `$${plan.price / 100}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-muted-foreground">/month</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isPro ? 'default' : 'outline'}
                    size="lg"
                    onClick={() => handleUpgrade(planId)}
                    disabled={loading !== null}
                  >
                    {loading === planId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {planId === 'free' ? 'Get started free' : `Upgrade to ${plan.name}`}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          All plans include AES-256 encryption, workspace isolation, and self-hosting option.
          Cancel anytime.
        </p>

        {/* Quote request form */}
        <div className="mt-20 max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Need something custom?</h2>
            <p className="text-muted-foreground mt-2">
              Tell us about your use case and we&apos;ll put together a tailored quote.
            </p>
          </div>

          {quoteStatus === 'sent' ? (
            <Card className="text-center py-12">
              <CardContent>
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <p className="text-lg font-semibold">Request received!</p>
                  <p className="text-muted-foreground text-sm">
                    We&apos;ll be in touch within one business day.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleQuoteSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="q-name">Name *</Label>
                      <Input
                        id="q-name"
                        required
                        value={quoteForm.name}
                        onChange={(e) => setQuoteForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Jane Smith"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="q-email">Email *</Label>
                      <Input
                        id="q-email"
                        type="email"
                        required
                        value={quoteForm.email}
                        onChange={(e) => setQuoteForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="jane@company.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="q-company">Company</Label>
                    <Input
                      id="q-company"
                      value={quoteForm.company}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder="Acme Inc. (optional)"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="q-service">Service needed *</Label>
                      <select
                        id="q-service"
                        required
                        value={quoteForm.service}
                        onChange={(e) => setQuoteForm((f) => ({ ...f, service: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="" disabled>Select a service</option>
                        {SERVICES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="q-budget">Monthly budget *</Label>
                      <select
                        id="q-budget"
                        required
                        value={quoteForm.budget}
                        onChange={(e) => setQuoteForm((f) => ({ ...f, budget: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="" disabled>Select a range</option>
                        {BUDGETS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="q-desc">Tell us more *</Label>
                    <Textarea
                      id="q-desc"
                      required
                      minLength={10}
                      rows={4}
                      value={quoteForm.description}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Describe your inbox setup, team size, integrations you need, or any other details..."
                    />
                  </div>

                  {quoteStatus === 'error' && (
                    <p className="text-sm text-destructive">
                      Something went wrong. Please try again or email us directly.
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={quoteStatus === 'sending'}>
                    {quoteStatus === 'sending' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {quoteStatus === 'sending' ? 'Sending…' : 'Request a quote'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

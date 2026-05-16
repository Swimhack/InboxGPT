# InboxGPT Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a freemium InboxGPT with Free (1 account, 500 msg/mo) and Pro ($9/mo, unlimited accounts + AI) tiers, deployed to inboxgpt.stricklandai.com on zeroclaw-dev.

**Architecture:** Simplify existing 3-tier model to 2 tiers. Add Groq as AI provider (OpenAI-compatible). Build a landing page at `/`. Add upgrade prompts at natural touchpoints. Deploy as standalone Next.js on PM2 behind nginx.

**Tech Stack:** Next.js 14, Drizzle ORM, PostgreSQL 16, Stripe (already installed), Groq (OpenAI SDK), Tailwind CSS + shadcn/ui

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/stripe/plans.ts` | Modify: 2 tiers (free + pro $9), update limits |
| `src/lib/ai/client.ts` | Modify: Add GroqClient class |
| `src/app/(marketing)/page.tsx` | Create: Landing page (hero, value props, pricing) |
| `src/app/page.tsx` | Modify: Show landing for unauthenticated, redirect for authenticated |
| `src/app/api/stripe/checkout/route.ts` | Modify: Update success URL, remove 'business' from schema |
| `src/lib/stripe/webhooks.ts` | Modify: Pause extra accounts on downgrade |
| `src/components/upgrade/upgrade-modal.tsx` | Create: Reusable upgrade prompt modal |
| `src/components/upgrade/upgrade-banner.tsx` | Create: Sync limit banner |
| `src/components/inbox/ai-brief.tsx` | Modify: Show locked state for free users |
| `src/app/(onboarding)/welcome/page.tsx` | Modify: Simplify to connect-email redirect |
| `src/lib/ai/limits.ts` | Modify: Plan-based gating instead of per-user lifetime |
| `ecosystem.config.js` | Create: PM2 config for deployment |

---

### Task 1: Simplify Plans to Free + Pro

**Files:**
- Modify: `src/lib/stripe/plans.ts`
- Modify: `src/app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Update plans.ts to 2-tier model**

Replace the entire file content:

```typescript
export type PlanId = 'free' | 'pro';

export interface PlanDef {
  id: PlanId;
  name: string;
  price: number; // cents/month, 0 = free
  priceLabel: string;
  channels: number;
  messagesPerMonth: number;
  ai: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '$0',
    channels: 1,
    messagesPerMonth: 500,
    ai: false,
    features: [
      '1 email account',
      '500 messages/month',
      'Unified inbox',
      'Search across accounts',
      'Star, archive, folders',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 900,
    priceLabel: '$9/mo',
    channels: Infinity,
    messagesPerMonth: Infinity,
    ai: true,
    features: [
      'Unlimited email accounts',
      'Unlimited messages',
      'AI daily brief',
      'AI categorization & priority',
      'AI suggested replies',
      'AI email summaries',
    ],
  },
};

export function getPriceId(plan: PlanId): string | null {
  if (plan === 'free') return null;
  if (plan === 'pro') return process.env.STRIPE_PRO_PRICE_ID || null;
  return null;
}

export function planFromPriceId(priceId: string): PlanId {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  return 'free';
}

export function canAddChannel(plan: string, currentCount: number): boolean {
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return currentCount < p.channels;
}

export function canSyncMessages(plan: string, currentMonthCount: number): boolean {
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return currentMonthCount < p.messagesPerMonth;
}

export function hasAI(plan: string): boolean {
  const p = PLANS[plan as PlanId] ?? PLANS.free;
  return p.ai;
}
```

- [ ] **Step 2: Update checkout route to remove 'business' enum value**

In `src/app/api/stripe/checkout/route.ts`, change the body schema:

```typescript
const bodySchema = z.object({
  plan: z.enum(['pro']),
});
```

And update the success URL to use `/inbox?upgraded=true`:

```typescript
const baseUrl = process.env.NEXTAUTH_URL || 'https://inboxgpt.stricklandai.com';

const checkoutSession = await createCheckoutSession({
  workspaceId: workspace.workspaceId,
  priceId,
  customerEmail: session.user.email,
  successUrl: `${baseUrl}/inbox?upgraded=true`,
  cancelUrl: `${baseUrl}/inbox`,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:\Users\james\Desktop\RANDOM\AI\InboxGPT && npx tsc --noEmit 2>&1 | head -20`

Fix any type errors from 'business' references — find them with: `grep -r "business" src/ --include="*.ts" --include="*.tsx" -l`

Replace any `'business'` plan references with `'pro'` where they appear.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe/plans.ts src/app/api/stripe/checkout/route.ts
git commit -m "feat: simplify pricing to Free + Pro ($9/mo) tiers"
```

---

### Task 2: Add Groq AI Provider

**Files:**
- Modify: `src/lib/ai/client.ts`

- [ ] **Step 1: Add GroqClient class after OpenRouterClient**

The Groq API is OpenAI-compatible. Add this class in `src/lib/ai/client.ts` after the `OpenRouterClient` class (after line ~297):

```typescript
class GroqClient {
  private client: OpenAI;
  private model: string;
  private lightModel: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('Groq API key not found. Set GROQ_API_KEY.');
    }
    this.client = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.model = model || 'llama-3.3-70b-versatile';
    this.lightModel = 'llama-3.1-8b-instant';
  }

  async summarize(subject: string, body: string): Promise<SummarizeResult> {
    const prompt = `Analyze this email and provide:
1. A concise summary (2-3 sentences)
2. Category (one of: primary, social, promotions, updates, forums, spam)
3. Priority (one of: urgent, high, normal, low)

Email Subject: ${subject}

Email Body:
${body.slice(0, 4000)}

Respond in JSON format only:
{"summary": "...", "category": "...", "priority": "..."}`;

    const response = await this.client.chat.completions.create({
      model: this.lightModel,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0].message.content;
    if (!rawContent) throw new Error('Empty response');

    try {
      const parsed = JSON.parse(rawContent);
      return { summary: parsed.summary, category: parsed.category, priority: parsed.priority };
    } catch {
      return { summary: rawContent.slice(0, 500), category: 'primary', priority: 'normal' };
    }
  }

  async generateReplies(subject: string, body: string, senderName: string): Promise<QuickReplyResult> {
    const prompt = `Generate 3 quick reply suggestions for this email. Each reply should be professional, concise (1-2 sentences), and offer different tones/approaches.

Email From: ${senderName}
Subject: ${subject}

Email Body:
${body.slice(0, 2000)}

Respond in JSON format only:
{"replies": ["reply 1...", "reply 2...", "reply 3..."]}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0].message.content;
    if (!rawContent) throw new Error('Empty response');

    try {
      const parsed = JSON.parse(rawContent);
      return { replies: parsed.replies };
    } catch {
      return { replies: [] };
    }
  }

  async generateBrief(prompt: string): Promise<BriefResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0].message.content;
    if (!raw) throw new Error('Empty response');

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      return {
        greeting: parsed.greeting || '',
        summary: parsed.summary || '',
        sections: parsed.sections || [],
        actionItems: parsed.actionItems || [],
      };
    } catch {
      return { greeting: 'Here is your inbox brief.', summary: '', sections: [], actionItems: [] };
    }
  }
}
```

- [ ] **Step 2: Update AIProvider type and AIClient constructor**

Change the type at the top of the file:

```typescript
export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'groq';
```

Update the `AIClient` class to add a `groq` property and handle it in the constructor:

```typescript
export class AIClient {
  private anthropic: AnthropicClient | null = null;
  private openai: OpenAIClient | null = null;
  private openrouter: OpenRouterClient | null = null;
  private groq: GroqClient | null = null;
  private provider: AIProvider;

  constructor(config?: AIClientConfig) {
    this.provider = config?.provider || (process.env.AI_PROVIDER as AIProvider) || 'anthropic';
    const model = config?.model || process.env.AI_MODEL;
    const apiKey = config?.apiKey;

    if (this.provider === 'anthropic') {
      this.anthropic = new AnthropicClient(model, apiKey);
    } else if (this.provider === 'openrouter') {
      this.openrouter = new OpenRouterClient(model, apiKey);
    } else if (this.provider === 'groq') {
      this.groq = new GroqClient(model, apiKey);
    } else {
      this.openai = new OpenAIClient(model, apiKey);
    }
  }
```

- [ ] **Step 3: Update AIClient methods to route through groq**

For each of the three methods (`summarize`, `generateReplies`, `generateBrief`), add the groq check. Example for `summarize`:

```typescript
  async summarize(subject: string, body: string): Promise<SummarizeResult> {
    if (this.anthropic) return this.anthropic.summarize(subject, body);
    if (this.groq) return this.groq.summarize(subject, body);
    if (this.openrouter) return this.openrouter.summarize(subject, body);
    if (this.openai) return this.openai.summarize(subject, body);
    throw new Error('No AI client configured');
  }
```

Do the same for `generateReplies` and `generateBrief`.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd C:\Users\james\Desktop\RANDOM\AI\InboxGPT && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors (existing errors from legacy code are ok).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/client.ts
git commit -m "feat: add Groq AI provider (OpenAI-compatible, llama-3.3-70b)"
```

---

### Task 3: Plan-Based AI Gating

**Files:**
- Modify: `src/lib/ai/limits.ts`
- Modify: `src/app/api/brief/route.ts` (if exists, or wherever brief is served)

- [ ] **Step 1: Rewrite limits.ts to gate on workspace plan**

Replace `src/lib/ai/limits.ts`:

```typescript
import { db, schema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { hasAI } from '@/lib/stripe/plans';

export async function canUseAI(workspaceId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const [workspace] = await db
    .select({ plan: schema.workspaces.plan })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) return { allowed: false, reason: 'Workspace not found' };

  if (!hasAI(workspace.plan || 'free')) {
    return { allowed: false, reason: 'upgrade_required' };
  }

  return { allowed: true };
}

export async function canSyncMore(workspaceId: string): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
}> {
  const [workspace] = await db
    .select({ plan: schema.workspaces.plan })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  const plan = workspace?.plan || 'free';
  const { PLANS } = await import('@/lib/stripe/plans');
  const planDef = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;
  const limit = planDef.messagesPerMonth;

  // Count messages synced this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      sql`${schema.messages.workspaceId} = ${workspaceId} AND ${schema.messages.receivedAt} >= ${startOfMonth.toISOString()}`
    );

  const currentCount = result?.count || 0;

  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
  };
}
```

- [ ] **Step 2: Find and update the brief API route**

Search for the brief route:

```bash
grep -r "brief" src/app/api/ --include="*.ts" -l
```

In that route, add the plan check at the top of the handler:

```typescript
import { canUseAI } from '@/lib/ai/limits';
import { requireWorkspace } from '@/lib/auth/workspace';

// Inside the handler, before generating the brief:
const workspace = await requireWorkspace();
const { allowed, reason } = await canUseAI(workspace.workspaceId);
if (!allowed) {
  return NextResponse.json({ error: reason, upgrade: true }, { status: 403 });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/limits.ts src/app/api/brief/
git commit -m "feat: gate AI features behind Pro plan check"
```

---

### Task 4: Upgrade Modal Component

**Files:**
- Create: `src/components/upgrade/upgrade-modal.tsx`

- [ ] **Step 1: Create the upgrade modal component**

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature: string; // e.g. "connect unlimited accounts", "AI daily brief"
}

export function UpgradeModal({ open, onClose, feature }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      router.push('/pricing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-xl font-bold">Upgrade to Pro</h2>
        </div>

        <p className="text-muted-foreground mb-6">
          Upgrade to Pro to {feature}. Just $9/month — cancel anytime.
        </p>

        <ul className="space-y-2 mb-6 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Unlimited email accounts
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Unlimited messages
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> AI brief, summaries & suggested replies
          </li>
        </ul>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Not now
          </Button>
          <Button onClick={handleUpgrade} disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upgrade — $9/mo
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/upgrade/upgrade-modal.tsx
git commit -m "feat: add reusable upgrade modal component"
```

---

### Task 5: Sync Limit Banner Component

**Files:**
- Create: `src/components/upgrade/upgrade-banner.tsx`

- [ ] **Step 1: Create the sync limit banner**

```typescript
'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradeBannerProps {
  message: string;
}

export function UpgradeBanner({ message }: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      window.location.href = '/pricing';
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="default" onClick={handleUpgrade} disabled={loading}>
          Upgrade to Pro
        </Button>
        <button onClick={() => setDismissed(true)} className="text-amber-600 hover:text-amber-800">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/upgrade/upgrade-banner.tsx
git commit -m "feat: add upgrade banner for sync limit warnings"
```

---

### Task 6: AI Brief Locked State

**Files:**
- Modify: `src/components/inbox/ai-brief.tsx`

- [ ] **Step 1: Add a locked/teaser variant to the AI Brief component**

At the top of `src/components/inbox/ai-brief.tsx`, add a prop for plan awareness. Modify the component to accept and check a `plan` prop:

After the existing imports, add:

```typescript
interface AIBriefProps {
  plan?: string;
}
```

Change the export from `export function AIBrief()` to `export function AIBrief({ plan }: AIBriefProps)`.

Then, at the very beginning of the component body (after the state declarations), add a locked state render:

```typescript
  // Show locked teaser for free users
  if (plan && plan !== 'pro') {
    return (
      <div className="relative border rounded-lg p-4 mb-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 overflow-hidden">
        <div className="absolute inset-0 backdrop-blur-[2px]" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <span className="font-medium text-sm">AI Daily Brief</span>
            <Badge variant="secondary" className="text-xs">Pro</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.location.href = '/pricing'}>
            Unlock with Pro
          </Button>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground mt-2">
          Get a daily AI summary of your inbox — priorities, action items, and what needs attention.
        </p>
      </div>
    );
  }
```

- [ ] **Step 2: Update the parent that renders AIBrief to pass the plan prop**

Find where `<AIBrief />` is rendered (likely in the inbox email list page or layout). Pass the workspace plan:

```typescript
<AIBrief plan={workspace?.plan || 'free'} />
```

If the parent is a server component, it can read the plan from the workspace context. If it's a client component, it may need the plan passed down from a server component or fetched from an API.

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/ai-brief.tsx
git commit -m "feat: show locked AI brief teaser for free tier users"
```

---

### Task 7: Account Add Gate

**Files:**
- Find and modify the component/page that handles "Add Account" (likely `src/components/accounts/add-account-dialog.tsx` or similar)

- [ ] **Step 1: Find the add account trigger**

```bash
grep -r "add.*account\|Add.*Account\|addAccount" src/components/ src/app/ --include="*.tsx" -l
```

- [ ] **Step 2: Add plan check before showing the add form**

In the component that handles adding a new account, import and use the upgrade modal:

```typescript
import { UpgradeModal } from '@/components/upgrade/upgrade-modal';

// In the component, add state:
const [showUpgrade, setShowUpgrade] = useState(false);

// Before opening the add-account dialog, check the plan:
const handleAddAccount = () => {
  if (plan === 'free' && accountCount >= 1) {
    setShowUpgrade(true);
    return;
  }
  // ... existing add account logic
};
```

And render the modal:

```tsx
<UpgradeModal
  open={showUpgrade}
  onClose={() => setShowUpgrade(false)}
  feature="connect unlimited email accounts"
/>
```

- [ ] **Step 3: Also enforce server-side in the accounts API**

Find the POST route that creates accounts (likely `/api/accounts/route.ts`). Add:

```typescript
import { canAddChannel } from '@/lib/stripe/plans';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Inside the POST handler, after auth:
const workspace = await requireWorkspace();
const [ws] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspace.workspaceId));
const existingAccounts = await db.select({ id: schema.channelAccounts.id }).from(schema.channelAccounts).where(eq(schema.channelAccounts.workspaceId, workspace.workspaceId));

if (!canAddChannel(ws?.plan || 'free', existingAccounts.length)) {
  return NextResponse.json({ error: 'Account limit reached. Upgrade to Pro.', upgrade: true }, { status: 403 });
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: gate adding accounts behind free tier limit (1 account)"
```

---

### Task 8: Landing Page

**Files:**
- Create: `src/app/(marketing)/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the landing page at `src/app/(marketing)/page.tsx`**

```typescript
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
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <h2 className="text-3xl font-bold text-center mb-10">Simple pricing</h2>
        <div className="grid md:grid-cols-2 gap-6">
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
              <span className="text-4xl font-bold">$9</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-2 text-sm mb-6">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Unlimited email accounts</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Unlimited messages</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI daily brief</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> AI categorization & priority</li>
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
```

- [ ] **Step 2: Update `src/app/page.tsx` to show landing for unauthenticated users**

Replace the current `page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import LandingPage from './(marketing)/page';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let session = null;

  try {
    session = await getSession();
  } catch (error) {
    console.error('Session error:', error);
  }

  // Not logged in — show landing page
  if (!session?.user) {
    return <LandingPage />;
  }

  // Check if user has completed onboarding
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { onboardingCompletedAt: true },
  });

  if (!user?.onboardingCompletedAt) {
    const accountCount = await db.query.emailAccounts.findMany({
      where: eq(schema.emailAccounts.userId, session.user.id),
      columns: { id: true },
    });

    if (accountCount.length === 0) {
      redirect('/connect-email');
    }

    await db
      .update(schema.users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(schema.users.id, session.user.id));
  }

  redirect('/inbox');
}
```

- [ ] **Step 3: Verify the page renders**

Run: `cd C:\Users\james\Desktop\RANDOM\AI\InboxGPT && npx tsc --noEmit 2>&1 | grep -i "marketing/page\|app/page" | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/\(marketing\)/page.tsx
git commit -m "feat: add landing page with hero, value props, and pricing"
```

---

### Task 9: Simplify Onboarding

**Files:**
- Modify: `src/app/(onboarding)/welcome/page.tsx`

- [ ] **Step 1: Simplify welcome page to redirect straight to connect-email**

Replace the welcome page with a simple redirect:

```typescript
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function WelcomePage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  redirect('/connect-email');
}
```

The landing page already explains the product — no need for a second intro screen.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(onboarding\)/welcome/page.tsx
git commit -m "refactor: simplify onboarding - skip welcome, go straight to connect-email"
```

---

### Task 10: Stripe Webhook Downgrade Logic

**Files:**
- Modify: `src/lib/stripe/webhooks.ts`

- [ ] **Step 1: Add account pausing on subscription deletion**

In `src/lib/stripe/webhooks.ts`, update the `customer.subscription.deleted` case to pause extra accounts:

```typescript
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return;

      // Downgrade workspace
      await db
        .update(schema.workspaces)
        .set({
          plan: 'free',
          stripeSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaces.id, workspaceId));

      // Pause all accounts except the oldest one
      const accounts = await db
        .select({ id: schema.channelAccounts.id, createdAt: schema.channelAccounts.createdAt })
        .from(schema.channelAccounts)
        .where(eq(schema.channelAccounts.workspaceId, workspaceId))
        .orderBy(schema.channelAccounts.createdAt);

      if (accounts.length > 1) {
        const idsTosPause = accounts.slice(1).map((a) => a.id);
        for (const id of idsTosPause) {
          await db
            .update(schema.channelAccounts)
            .set({ status: 'paused', updatedAt: new Date() })
            .where(eq(schema.channelAccounts.id, id));
        }
        console.log(`[stripe] Paused ${idsTosPause.length} extra accounts for workspace ${workspaceId}`);
      }

      console.log(`[stripe] Subscription cancelled → workspace ${workspaceId} downgraded to free`);
      break;
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stripe/webhooks.ts
git commit -m "feat: pause extra accounts on subscription cancellation (downgrade)"
```

---

### Task 11: Sync Limit Enforcement

**Files:**
- Modify: `src/lib/queue/processors.ts`

- [ ] **Step 1: Add sync limit check in email sync processor**

At the top of the `processEmailSync` function (or wherever it begins processing), add:

```typescript
import { canSyncMore } from '@/lib/ai/limits';

// Inside processEmailSync, before fetching messages:
const syncCheck = await canSyncMore(data.workspaceId);
if (!syncCheck.allowed) {
  console.log(`[sync] Workspace ${data.workspaceId} hit sync limit (${syncCheck.currentCount}/${syncCheck.limit}). Skipping.`);
  return { synced: 0, skipped: true, reason: 'sync_limit_reached' };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queue/processors.ts
git commit -m "feat: enforce 500 msg/month sync limit for free tier"
```

---

### Task 12: Settings Billing Link

**Files:**
- Modify: `src/app/api/stripe/portal/route.ts`
- Find and modify the settings page to add a "Manage Billing" button

- [ ] **Step 1: Verify the portal route exists and works**

Read `src/app/api/stripe/portal/route.ts`. It should already call `createPortalSession`. If it exists, ensure the return URL points to `/settings`.

- [ ] **Step 2: Add billing section to settings page**

In the settings page (find it via `grep -r "settings" src/app/ --include="page.tsx" -l`), add a billing section:

```typescript
{workspace?.plan === 'pro' && (
  <div className="border rounded-lg p-4">
    <h3 className="font-medium mb-2">Billing</h3>
    <p className="text-sm text-muted-foreground mb-3">
      You&apos;re on the Pro plan ($9/mo).
    </p>
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const res = await fetch('/api/stripe/portal', { method: 'POST' });
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      }}
    >
      Manage Billing
    </Button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Manage Billing link in settings for Pro users"
```

---

### Task 13: PM2 Ecosystem & Deploy Script

**Files:**
- Create: `ecosystem.config.js`
- Create: `deploy.sh`

- [ ] **Step 1: Create PM2 ecosystem config**

Create `ecosystem.config.js` in the project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'inboxgpt',
      script: 'server.js',
      cwd: '/var/www/sites/inboxgpt.stricklandai.com/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
        HOSTNAME: '127.0.0.1',
      },
    },
  ],
};
```

- [ ] **Step 2: Create deploy script**

Create `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "=== InboxGPT Deploy ==="

# Build locally
echo "[1/4] Building..."
npm run build

# SCP standalone build to server
echo "[2/4] Uploading standalone build..."
SSH_KEY="$HOME/.ssh/fleet_admin_key"
SERVER="james@137.184.136.55"
REMOTE_DIR="/var/www/sites/inboxgpt.stricklandai.com/app"

scp -i "$SSH_KEY" -r .next/standalone/* "$SERVER:$REMOTE_DIR/"
scp -i "$SSH_KEY" -r .next/static "$SERVER:$REMOTE_DIR/.next/"
scp -i "$SSH_KEY" -r public "$SERVER:$REMOTE_DIR/"

# Copy ecosystem config
echo "[3/4] Uploading PM2 config..."
scp -i "$SSH_KEY" ecosystem.config.js "$SERVER:$REMOTE_DIR/"

# Restart PM2
echo "[4/4] Restarting PM2..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js"

echo "=== Deploy complete: https://inboxgpt.stricklandai.com ==="
```

- [ ] **Step 3: Make deploy script executable**

```bash
chmod +x deploy.sh
```

- [ ] **Step 4: Commit**

```bash
git add ecosystem.config.js deploy.sh
git commit -m "feat: add PM2 ecosystem config and deploy script for zeroclaw-dev"
```

---

### Task 14: Server Setup & First Deploy

**Files:** None (all server-side commands)

- [ ] **Step 1: Create DNS A record**

Add A record: `inboxgpt.stricklandai.com` → `137.184.136.55`

(Do this in the DNS provider — likely DigitalOcean or wherever stricklandai.com is managed)

- [ ] **Step 2: Create site on server**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "sudo add-site inboxgpt.stricklandai.com nextjs 3100"
```

- [ ] **Step 3: Create PostgreSQL database**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "sudo -u postgres createdb inboxgpt"
```

- [ ] **Step 4: Set PM2 environment variables**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 bash -s << 'EOF'
cd /var/www/sites/inboxgpt.stricklandai.com/app

# Create .env.local with all secrets
cat > .env.local << 'ENVEOF'
DATABASE_URL=postgresql://james@localhost:5432/inboxgpt
NEXTAUTH_URL=https://inboxgpt.stricklandai.com
NEXTAUTH_SECRET=GENERATE_THIS
ENCRYPTION_KEY=GENERATE_THIS
GOOGLE_CLIENT_ID=EXISTING_VALUE
GOOGLE_CLIENT_SECRET=EXISTING_VALUE
GROQ_API_KEY=STORED_SECURELY
AI_PROVIDER=groq
AI_MODEL=llama-3.3-70b-versatile
STRIPE_SECRET_KEY=FROM_STRIPE
STRIPE_WEBHOOK_SECRET=FROM_STRIPE
STRIPE_PRO_PRICE_ID=FROM_STRIPE
AUTH_ALLOW_PASSWORD=true
ENVEOF
EOF
```

(Replace placeholder values with actual secrets at deploy time)

- [ ] **Step 5: Run Drizzle migrations**

After deploying the app code:

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "cd /var/www/sites/inboxgpt.stricklandai.com/app && npx drizzle-kit push"
```

- [ ] **Step 6: Deploy the app**

From the local InboxGPT directory:

```bash
bash deploy.sh
```

- [ ] **Step 7: Add Google OAuth redirect URI**

In Google Cloud Console, add `https://inboxgpt.stricklandai.com/api/auth/callback/google` as an authorized redirect URI.

- [ ] **Step 8: Create Stripe product and price**

In Stripe Dashboard:
1. Create product "InboxGPT Pro"
2. Add price: $9/month recurring USD
3. Copy the price ID → set as `STRIPE_PRO_PRICE_ID` in `.env.local`
4. Create webhook endpoint: `https://inboxgpt.stricklandai.com/api/stripe/webhooks`
5. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
6. Copy webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

- [ ] **Step 9: Verify deployment**

```bash
curl -sL -o /dev/null -w "%{http_code}" https://inboxgpt.stricklandai.com/
# Expected: 200

curl -s https://inboxgpt.stricklandai.com/api/auth/providers
# Expected: JSON with google provider
```

- [ ] **Step 10: Commit any last adjustments**

```bash
git add -A && git commit -m "chore: finalize deployment configuration" || true
```

---

## Execution Summary

| Task | What it does | Depends on |
|------|-------------|-----------|
| 1 | Simplify plans to Free + Pro | — |
| 2 | Add Groq AI provider | — |
| 3 | Plan-based AI gating | Task 1 |
| 4 | Upgrade modal component | — |
| 5 | Sync limit banner component | — |
| 6 | AI brief locked state | Task 1 |
| 7 | Account add gate | Tasks 1, 4 |
| 8 | Landing page | — |
| 9 | Simplify onboarding | — |
| 10 | Webhook downgrade logic | Task 1 |
| 11 | Sync limit enforcement | Task 3 |
| 12 | Settings billing link | — |
| 13 | PM2 & deploy script | — |
| 14 | Server setup & deploy | Tasks 1-13 |

Tasks 1, 2, 4, 5, 8, 9, 12, 13 are independent and can run in parallel.
Tasks 3, 6, 7, 10, 11 depend on Task 1.
Task 14 depends on all others.

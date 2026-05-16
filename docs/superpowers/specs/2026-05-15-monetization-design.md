# InboxGPT Monetization Strategy

## Overview

InboxGPT is a unified email inbox for solo freelancers and creators. The core value proposition is "All your email. One inbox." — connecting Gmail, Outlook, and IMAP accounts in a single view. AI features (summaries, categorization, suggested replies) are a premium value-add, not the headline.

**Target customer**: Solo freelancers/creators managing multiple email accounts who want to stop switching between apps.

**Monetization model**: Freemium funnel. Generous free tier (1 account) with a single paid tier ($9/mo) unlocked by connecting a second account or wanting AI features.

**Timeline**: Ship this week. Free tier live immediately, Stripe checkout wired for Pro upgrades.

---

## Pricing Model

### Free Tier — $0/forever

- 1 email account (Gmail, Outlook, or IMAP)
- 500 synced messages/month
- Core inbox: search, star, archive, folders, compose
- No AI features

### Pro Tier — $9/month

- Unlimited email accounts
- Unlimited synced messages
- AI inbox brief (daily summary of unread emails)
- AI categorization + priority sorting
- AI suggested replies
- AI email summaries
- Future channels (Slack, SMS, Discord) included at no extra cost when they ship

### Design Decisions

- No annual plan at launch. Add later if conversion data supports it.
- No Business/Enterprise tier. If team features are needed later, that's a future product decision.
- No usage-based pricing. Flat $9/mo is simple to understand and sell.
- Downgrade is graceful: extra accounts pause (not delete), AI stops, sync cap resets. Users keep all existing data.

---

## Landing Page

**URL**: `https://inboxgpt.stricklandai.com`

**Single page structure:**

### 1. Hero

- Headline: "All your email. One inbox."
- Subhead: "Connect Gmail, Outlook, and IMAP accounts in one place. Free forever for your first account."
- CTA: "Get Started Free" → `/register`

### 2. Three Value Props (icon + short copy)

| Icon | Title | Copy |
|------|-------|------|
| Link | Connect Everything | Gmail, Outlook, any IMAP email in one unified view |
| Search | Smart Organization | Search across all accounts, star, archive, filter by folder |
| Sparkles (Pro badge) | AI That Works For You | Daily briefs, auto-categorization, suggested replies |

### 3. Pricing Section (two cards)

**Free card:**
- 1 email account
- 500 messages/month
- Core inbox features
- Button: "Get Started Free"

**Pro card ($9/mo):**
- Unlimited accounts
- Unlimited messages
- All AI features
- Button: "Start Free, Upgrade Anytime"

Both buttons go to the same `/register` flow. Pro just sets expectations.

### 4. Footer

- StricklandAI ecosystem branding
- Links: Terms, Privacy

### What's NOT on the landing page at launch

- Testimonials (no users yet)
- Feature matrix / comparison table
- FAQ section
- Blog / changelog

---

## Onboarding Flow

### First-time user journey

1. **Sign up** — email/password or Google OAuth
2. **If Google OAuth** → Gmail auto-connected as channel account, redirect to `/inbox`. Done.
3. **If email/password** → "Connect your first email account" page
   - Gmail OAuth (one-click)
   - Outlook OAuth (one-click)
   - IMAP manual (host/port/credentials)
4. **Account connects** → redirect to `/inbox`, sync starts in background
5. **Welcome toast**: "Syncing your emails now. They'll appear in a few seconds."

### Simplifications from current onboarding

- Remove the channel grid step (no multi-channel at launch)
- Remove the fake progress bar / completion page
- Remove the `/welcome` intro step (landing page already sold them)
- Single step after signup: connect email → inbox

### Returning users

- Authenticated users hitting `/` → redirect to `/inbox`
- Users with existing accounts skip onboarding entirely

---

## Upgrade Funnel

### Touchpoints (soft walls, never hard blocks)

| Moment | UX Treatment |
|--------|--------------|
| Click "Add Account" on free tier | Modal: "Pro lets you connect unlimited accounts. $9/mo." Upgrade button + dismiss. |
| AI Brief card in inbox | Greyed card with lock icon: "Unlock your daily AI brief with Pro" |
| Email detail view | "AI Summary" and "Suggested Replies" sections show blurred placeholder + "Upgrade to Pro" link |
| Settings → AI tab | "AI features require Pro. Upgrade to unlock." |
| Hit 500 msg/mo sync limit | Banner at top of inbox: "You've hit your monthly sync limit. Upgrade to Pro for unlimited." Sync pauses until next month or upgrade. |

### Principles

- Free users never feel tricked or punished
- The product is genuinely useful on free tier with one account
- Upgrade prompts are visible but not aggressive — no popups, no countdown timers
- The wall is natural: needing a 2nd account or wanting AI help

---

## Stripe Integration

### Setup

- One Stripe Product: "InboxGPT Pro"
- One Price: $9/month recurring USD
- Stripe Customer Portal enabled for self-service billing

### Checkout Flow

1. User clicks any upgrade CTA
2. `POST /api/stripe/checkout` → creates Stripe Checkout Session with user's email prefilled
3. Redirect to Stripe-hosted checkout page
4. **Success**: redirect to `/inbox?upgraded=true` → show success toast, workspace plan set to "pro"
5. **Cancel**: redirect back to previous page

### Webhooks

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Set workspace.plan = "pro", store stripeCustomerId + stripeSubscriptionId |
| `customer.subscription.updated` | Handle plan changes (future-proof) |
| `customer.subscription.deleted` | Downgrade: workspace.plan = "free", pause extra accounts, revoke AI |

### Webhook endpoint

`POST https://inboxgpt.stricklandai.com/api/stripe/webhook`

### Downgrade Behavior

- AI features stop immediately (brief, summaries, categorization, suggestions)
- Extra accounts beyond the first are paused (sync stops, not deleted)
- Paused accounts show "Reactivate with Pro" badge
- Sync limit resets to 500/month
- All existing synced emails remain accessible (read-only for paused accounts)

### Billing Portal

- Accessible from Settings → "Manage Billing"
- Links to Stripe Customer Portal (cancel, update payment, view invoices)
- No custom billing UI needed

---

## AI Provider

### Groq

- **Base URL**: `https://api.groq.com/openai/v1`
- **Auth**: `GROQ_API_KEY` env var (Bearer token)
- **Primary model**: `llama-3.3-70b-versatile` — summaries, brief generation, suggested replies
- **Light model**: `llama-3.1-8b-instant` — categorization, priority classification
- **Integration**: OpenAI-compatible SDK, swap base URL and key. Reuse existing OpenAI client code.

### AI Features (Pro only)

| Feature | Model | Trigger |
|---------|-------|---------|
| Email summary | 70b | On email open (lazy, cached) |
| Categorization | 8b | On sync (batch, background) |
| Priority classification | 8b | On sync (batch, background) |
| Suggested replies | 70b | On email open (lazy, cached) |
| Inbox brief | 70b | Daily generation, top 50 unread emails |

### Gating

- Free tier: AI endpoints return `{ error: "upgrade_required", plan: "pro" }` with 403
- Pro tier: Full access, no per-user rate limit at launch (monitor usage)

---

## Deployment

### Infrastructure

- **Server**: zeroclaw-dev (137.184.136.55)
- **Site dir**: `/var/www/sites/inboxgpt.stricklandai.com/app/`
- **Runtime**: PM2 process `inboxgpt` on port 3100
- **Proxy**: nginx reverse proxy with SSL (Let's Encrypt)
- **Database**: PostgreSQL 16 on localhost, database name `inboxgpt`
- **Setup command**: `add-site inboxgpt.stricklandai.com nextjs 3100`

### DNS

- A record: `inboxgpt.stricklandai.com` → `137.184.136.55`

### Environment Variables (PM2 ecosystem)

| Variable | Value/Source |
|----------|-------------|
| `DATABASE_URL` | `postgresql://james@localhost:5432/inboxgpt` |
| `NEXTAUTH_URL` | `https://inboxgpt.stricklandai.com` |
| `NEXTAUTH_SECRET` | Generate fresh (openssl rand -base64 32) |
| `ENCRYPTION_KEY` | Generate 32-byte hex (openssl rand -hex 32) |
| `GOOGLE_CLIENT_ID` | Existing credential |
| `GOOGLE_CLIENT_SECRET` | Existing credential |
| `GROQ_API_KEY` | Groq API key |
| `AI_PROVIDER` | `groq` |
| `AI_MODEL` | `llama-3.3-70b-versatile` |
| `STRIPE_SECRET_KEY` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook config |
| `STRIPE_PRO_PRICE_ID` | Created in Stripe dashboard |

### Deploy Workflow

```bash
# Local: build standalone
cd C:\Users\james\Desktop\RANDOM\AI\InboxGPT
npm run build

# SCP to server
scp -i ~/.ssh/fleet_admin_key -r .next/standalone/* james@137.184.136.55:/var/www/sites/inboxgpt.stricklandai.com/app/
scp -i ~/.ssh/fleet_admin_key -r .next/static james@137.184.136.55:/var/www/sites/inboxgpt.stricklandai.com/app/.next/
scp -i ~/.ssh/fleet_admin_key -r public james@137.184.136.55:/var/www/sites/inboxgpt.stricklandai.com/app/

# Remote: restart
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "pm2 restart inboxgpt"
```

### Google OAuth

Add authorized redirect URI: `https://inboxgpt.stricklandai.com/api/auth/callback/google`

---

## Launch Checklist

### Day 1-2: Core Fixes

- [ ] Simplify plans.ts: 2 tiers (free + pro $9/mo)
- [ ] Add Groq AI adapter (OpenAI client with swapped base URL)
- [ ] Enforce free tier: 1 account cap check in add-account flow
- [ ] Enforce free tier: 500 msg/mo sync limit in processor
- [ ] Gate AI endpoints behind plan check (return 403 for free users)
- [ ] Wire Stripe: create product + price in dashboard
- [ ] Build `/api/stripe/checkout` endpoint
- [ ] Build `/api/stripe/webhook` endpoint
- [ ] Add billing portal link in Settings

### Day 3: Landing Page + Upgrade UX

- [ ] Build landing page at `/` (hero, value props, pricing, footer)
- [ ] Add account modal upgrade prompt for free users
- [ ] Add AI brief teaser (locked card) for free users
- [ ] Add blurred AI placeholders in email detail for free users
- [ ] Add sync limit banner component
- [ ] Simplify onboarding: remove channel grid, remove completion page

### Day 4: Deploy

- [ ] Create DNS A record for inboxgpt.stricklandai.com
- [ ] Run `add-site inboxgpt.stricklandai.com nextjs 3100` on server
- [ ] Create PostgreSQL database `inboxgpt`
- [ ] Run Drizzle migrations
- [ ] Set all env vars in PM2 ecosystem file
- [ ] Add Google OAuth redirect URI for new domain
- [ ] Configure Stripe webhook endpoint URL in Stripe dashboard
- [ ] Build, deploy, verify app loads

### Day 5: Smoke Test & Go Live

- [ ] Test: signup with email/password → connect Gmail → see emails
- [ ] Test: signup with Google OAuth → auto-connect → see emails
- [ ] Test: free user hits "Add Account" → sees upgrade modal
- [ ] Test: free user sees AI teasers (brief, summary, replies)
- [ ] Test: upgrade via Stripe checkout → plan changes to pro
- [ ] Test: pro user connects 2nd account → syncs successfully
- [ ] Test: pro user sees AI brief, summaries, suggested replies
- [ ] Test: cancel subscription → graceful downgrade
- [ ] Share link, accept signups

---

## Future Roadmap (Post-Launch)

These are explicitly NOT in scope for launch but noted for direction:

- **Channels**: Slack, Discord, SMS (Twilio) — unlock with Pro at no extra cost
- **Annual pricing**: $89/year (save ~17%) if monthly conversion is strong
- **Team tier**: $19/mo per seat, shared inbox, assignment, internal notes
- **Custom domain**: White-label for agencies (future tier)
- **Mobile app**: React Native wrapper of the web inbox
- **Integrations**: Calendar, task managers, CRM connections
- **AI training**: Per-user reply style learning, custom categorization rules

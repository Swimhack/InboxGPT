# Inbox Pro

Privacy-first, self-hostable AI-powered unified inbox platform.

## Features

- **Unified Inbox**: Connect multiple email accounts (Gmail, Outlook, Yahoo, iCloud, any IMAP)
- **AI-Powered**: Email summarization, smart categorization, and suggested replies
- **Privacy-First**: Self-hostable with encrypted credentials
- **Modern UI**: Clean, responsive interface built with shadcn/ui
- **Stupid Simple**: No Redis, no separate workers, just `npm run dev`

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **Database**: SQLite via Drizzle ORM
- **UI**: Tailwind CSS + shadcn/ui
- **Auth**: NextAuth.js
- **Email**: ImapFlow (IMAP), Nodemailer (SMTP)
- **AI**: Anthropic Claude / OpenAI GPT
- **Deployment**: Fly.io, Docker, or any Node.js host

## Quick Start

### 1. Install & Configure

```bash
npm install
cp .env.example .env
# Edit .env with your AI API key (ANTHROPIC_API_KEY or OPENAI_API_KEY)
```

### 2. Initialize Database

```bash
npm run db:push
```

### 3. Start

```bash
npm run dev
```

Open http://localhost:3000 - that's it!

## Deploy to Fly.io

### First-time setup:

```bash
fly launch --no-deploy
fly secrets set NEXTAUTH_SECRET=$(openssl rand -base64 32)
fly secrets set ENCRYPTION_KEY=$(openssl rand -hex 32)
fly secrets set ANTHROPIC_API_KEY=your-key
fly secrets set NEXTAUTH_URL=https://your-app.fly.dev
fly deploy
```

### Updates:

```bash
fly deploy
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | SQLite path (default: `./data/inboxpro.db`) |
| `NEXTAUTH_SECRET` | Yes | Session encryption key |
| `ENCRYPTION_KEY` | Yes | 64-char hex for credential encryption |
| `ANTHROPIC_API_KEY` | Yes* | Claude API key |
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `GOOGLE_CLIENT_ID` | No | For Gmail OAuth |
| `GOOGLE_CLIENT_SECRET` | No | For Gmail OAuth |
| `AZURE_AD_CLIENT_ID` | No | For Outlook OAuth |
| `AZURE_AD_CLIENT_SECRET` | No | For Outlook OAuth |

*At least one AI provider key required

## OAuth Setup (Optional)

OAuth enables one-click account connection. Without it, users can still connect using App Passwords.

### Gmail
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Enable Gmail API
4. Add redirect URI: `https://your-domain/api/auth/oauth/gmail/callback`

### Outlook
1. Go to [Azure Portal](https://portal.azure.com)
2. Register application in Azure AD
3. Add Mail.Read, Mail.Send permissions
4. Add redirect URI: `https://your-domain/api/auth/oauth/outlook/callback`

## Security

- All OAuth tokens and IMAP passwords are encrypted with AES-256-GCM
- Database stored locally (SQLite)
- Self-hostable for complete data control
- No external services required (besides AI API)

## License

MIT

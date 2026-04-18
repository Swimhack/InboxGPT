export const PROMPTS = {
  SUMMARIZE_EMAIL: `Analyze this email and provide:
1. A concise summary (2-3 sentences)
2. Category (one of: primary, social, promotions, updates, forums, spam)
3. Priority (one of: urgent, high, normal, low)

Consider the following when categorizing:
- primary: Personal emails, important work emails, direct communications
- social: Social network notifications, friend updates
- promotions: Marketing, sales, deals, advertisements
- updates: Automated notifications, receipts, confirmations
- forums: Mailing lists, group discussions
- spam: Suspected spam or unwanted emails

Consider the following when prioritizing:
- urgent: Requires immediate attention (deadlines, emergencies)
- high: Important but not time-sensitive
- normal: Regular emails
- low: Can be read later, informational only`,

  GENERATE_REPLIES: `Generate 3 quick reply suggestions for this email.
Each reply should be:
- Professional and appropriate for business communication
- Concise (1-2 sentences maximum)
- Offer different tones/approaches (e.g., formal, friendly, brief)
- Complete and ready to send (not templates with placeholders)`,

  THREAD_SUMMARY: `Summarize this email thread, highlighting:
1. The main topic of discussion
2. Key decisions or action items
3. The current status or pending questions
Keep the summary to 3-4 sentences.`,
};

export function buildSummarizePrompt(subject: string, body: string): string {
  return `${PROMPTS.SUMMARIZE_EMAIL}

Email Subject: ${subject}

Email Body:
${body.slice(0, 4000)}

Respond in JSON format only:
{
  "summary": "...",
  "category": "...",
  "priority": "..."
}`;
}

export function buildReplyPrompt(
  subject: string,
  body: string,
  senderName: string
): string {
  return `${PROMPTS.GENERATE_REPLIES}

Email From: ${senderName}
Subject: ${subject}

Email Body:
${body.slice(0, 2000)}

Respond in JSON format only:
{
  "replies": [
    "Reply 1...",
    "Reply 2...",
    "Reply 3..."
  ]
}`;
}

export interface BriefEmailData {
  subject: string;
  from: string;
  snippet: string;
  category: string;
  priority: string;
  receivedAt: string;
  account: string;
}

export function buildBriefPrompt(
  userName: string,
  accountEmails: string[],
  emails: BriefEmailData[],
  timezone?: string,
): string {
  const now = new Date();
  let timeOfDay: string;
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone || 'America/Chicago',
      }).format(now)
    );
    timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  } catch {
    timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
  }

  if (emails.length === 0) {
    return `You are an AI email assistant. Generate a brief JSON status for ${userName || 'the user'}.
They have ${accountEmails.length} connected email account(s): ${accountEmails.join(', ')}.
There are no unread emails right now. It is ${timeOfDay}.

Respond in JSON format only:
{
  "greeting": "A short, warm greeting mentioning it's a quiet inbox",
  "summary": "One sentence noting no pending items",
  "sections": [],
  "actionItems": []
}`;
  }

  const emailList = emails
    .map(
      (e, i) =>
        `${i + 1}. [${e.priority.toUpperCase()}] "${e.subject}" from ${e.from} (${e.category}, ${e.account}) — ${e.snippet?.slice(0, 120) || 'No preview'} — ${e.receivedAt}`
    )
    .join('\n');

  return `You are an executive AI assistant creating a daily brief for ${userName || 'a busy entrepreneur'}.
Your user is a busy entrepreneur who needs to quickly triage their inbox and focus on what matters.
Connected accounts: ${accountEmails.join(', ')}
Current time: ${now.toISOString()} (${timeOfDay})
Unread emails (${emails.length}):

${emailList}

Create a concise, actionable brief that helps them decide what to do first. Think like a chief of staff:
- Lead with what's urgent or time-sensitive
- Group by theme: deals, clients, operations, team, finance, etc.
- Extract concrete action items with deadlines when mentioned
- Flag anything that needs a reply today
- Note patterns (e.g. "3 follow-ups pending from last week")
- Keep summaries tight — one sentence max per email

Respond in JSON format only:
{
  "greeting": "Short, energizing ${timeOfDay} greeting for ${userName || 'the user'}",
  "summary": "Punchy overview (e.g. '12 unread — 2 need replies today, 1 deal update')",
  "sections": [
    {
      "title": "Section name (e.g. 'Reply Today', 'Deal Flow', 'Team Updates', 'FYI')",
      "items": [
        { "subject": "Email subject", "from": "Sender name", "summary": "One-sentence actionable summary", "priority": "urgent|high|normal|low" }
      ]
    }
  ],
  "actionItems": [
    { "text": "Specific action to take", "source": "Email/sender this relates to", "urgency": "high|medium|low" }
  ]
}`;
}

export function buildThreadSummaryPrompt(
  emails: Array<{ from: string; subject: string; body: string; date: Date }>
): string {
  const threadContent = emails
    .map(
      (e) =>
        `From: ${e.from}
Date: ${e.date.toISOString()}
Subject: ${e.subject}
---
${e.body.slice(0, 1000)}
---`
    )
    .join('\n\n');

  return `${PROMPTS.THREAD_SUMMARY}

Email Thread:
${threadContent.slice(0, 6000)}

Respond with the summary only, no JSON formatting needed.`;
}

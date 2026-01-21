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

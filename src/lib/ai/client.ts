import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type AIProvider = 'anthropic' | 'openai' | 'openrouter';

export interface AIClientConfig {
  provider: AIProvider;
  model?: string;
  apiKey?: string;
}

export interface SummarizeResult {
  summary: string;
  category: 'primary' | 'social' | 'promotions' | 'updates' | 'forums' | 'spam';
  priority: 'urgent' | 'high' | 'normal' | 'low';
}

export interface QuickReplyResult {
  replies: string[];
}

export interface BriefResult {
  greeting: string;
  summary: string;
  sections: Array<{
    title: string;
    items: Array<{ subject: string; from: string; summary: string; priority: string }>;
  }>;
  actionItems: Array<{
    text: string;
    source: string;
    urgency: 'high' | 'medium' | 'low';
  }>;
}

class AnthropicClient {
  private client: Anthropic;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('Anthropic API key not found');
    }
    this.client = new Anthropic({ apiKey: key });
    this.model = model || 'claude-3-5-sonnet-20241022';
  }

  async summarize(subject: string, body: string): Promise<SummarizeResult> {
    const prompt = `Analyze this email and provide:
1. A concise summary (2-3 sentences)
2. Category (one of: primary, social, promotions, updates, forums, spam)
3. Priority (one of: urgent, high, normal, low)

Email Subject: ${subject}

Email Body:
${body.slice(0, 4000)}

Respond in JSON format:
{
  "summary": "...",
  "category": "...",
  "priority": "..."
}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      const parsed = JSON.parse(content.text);
      return {
        summary: parsed.summary,
        category: parsed.category,
        priority: parsed.priority,
      };
    } catch {
      return {
        summary: content.text.slice(0, 500),
        category: 'primary',
        priority: 'normal',
      };
    }
  }

  async generateReplies(subject: string, body: string, senderName: string): Promise<QuickReplyResult> {
    const prompt = `Generate 3 quick reply suggestions for this email. Each reply should be professional, concise (1-2 sentences), and offer different tones/approaches.

Email From: ${senderName}
Subject: ${subject}

Email Body:
${body.slice(0, 2000)}

Respond in JSON format:
{
  "replies": [
    "reply 1...",
    "reply 2...",
    "reply 3..."
  ]
}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      const parsed = JSON.parse(content.text);
      return { replies: parsed.replies };
    } catch {
      return { replies: [] };
    }
  }

  async generateBrief(prompt: string): Promise<BriefResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content.text);
      return {
        greeting: parsed.greeting || '',
        summary: parsed.summary || '',
        sections: parsed.sections || [],
        actionItems: parsed.actionItems || [],
      };
    } catch {
      return {
        greeting: 'Here is your inbox brief.',
        summary: '',
        sections: [],
        actionItems: [],
      };
    }
  }
}

class OpenRouterClient {
  private client: OpenAI;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey || process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY;
    if (!key) {
      throw new Error('OpenRouter API key not found. Set OPENROUTER_API_KEY or AI_API_KEY.');
    }
    this.client = new OpenAI({
      apiKey: key,
      baseURL: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
    });
    this.model = model || 'openrouter/anthropic/claude-sonnet-4';
  }

  async summarize(subject: string, body: string): Promise<SummarizeResult> {
    const prompt = `Analyze this email and provide:
1. A concise summary (2-3 sentences)
2. Category (one of: primary, social, promotions, updates, forums, spam)
3. Priority (one of: urgent, high, normal, low)

Email Subject: ${subject}

Email Body:
${body.slice(0, 4000)}

Respond in JSON format:
{
  "summary": "...",
  "category": "...",
  "priority": "..."
}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary,
        category: parsed.category,
        priority: parsed.priority,
      };
    } catch {
      return {
        summary: content.slice(0, 500),
        category: 'primary',
        priority: 'normal',
      };
    }
  }

  async generateReplies(subject: string, body: string, senderName: string): Promise<QuickReplyResult> {
    const prompt = `Generate 3 quick reply suggestions for this email. Each reply should be professional, concise (1-2 sentences), and offer different tones/approaches.

Email From: ${senderName}
Subject: ${subject}

Email Body:
${body.slice(0, 2000)}

Respond in JSON format:
{
  "replies": [
    "reply 1...",
    "reply 2...",
    "reply 3..."
  ]
}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return { replies: parsed.replies };
    } catch {
      return { replies: [] };
    }
  }

  async generateBrief(prompt: string): Promise<BriefResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        greeting: parsed.greeting || '',
        summary: parsed.summary || '',
        sections: parsed.sections || [],
        actionItems: parsed.actionItems || [],
      };
    } catch {
      return {
        greeting: 'Here is your inbox brief.',
        summary: '',
        sections: [],
        actionItems: [],
      };
    }
  }
}

class OpenAIClient {
  private client: OpenAI;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key not found');
    }
    this.client = new OpenAI({ apiKey: key });
    this.model = model || 'gpt-4o-mini';
  }

  async summarize(subject: string, body: string): Promise<SummarizeResult> {
    const prompt = `Analyze this email and provide:
1. A concise summary (2-3 sentences)
2. Category (one of: primary, social, promotions, updates, forums, spam)
3. Priority (one of: urgent, high, normal, low)

Email Subject: ${subject}

Email Body:
${body.slice(0, 4000)}

Respond in JSON format:
{
  "summary": "...",
  "category": "...",
  "priority": "..."
}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary,
        category: parsed.category,
        priority: parsed.priority,
      };
    } catch {
      return {
        summary: content.slice(0, 500),
        category: 'primary',
        priority: 'normal',
      };
    }
  }

  async generateReplies(subject: string, body: string, senderName: string): Promise<QuickReplyResult> {
    const prompt = `Generate 3 quick reply suggestions for this email. Each reply should be professional, concise (1-2 sentences), and offer different tones/approaches.

Email From: ${senderName}
Subject: ${subject}

Email Body:
${body.slice(0, 2000)}

Respond in JSON format:
{
  "replies": [
    "reply 1...",
    "reply 2...",
    "reply 3..."
  ]
}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return { replies: parsed.replies };
    } catch {
      return { replies: [] };
    }
  }

  async generateBrief(prompt: string): Promise<BriefResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        greeting: parsed.greeting || '',
        summary: parsed.summary || '',
        sections: parsed.sections || [],
        actionItems: parsed.actionItems || [],
      };
    } catch {
      return {
        greeting: 'Here is your inbox brief.',
        summary: '',
        sections: [],
        actionItems: [],
      };
    }
  }
}

export class AIClient {
  private anthropic: AnthropicClient | null = null;
  private openai: OpenAIClient | null = null;
  private openrouter: OpenRouterClient | null = null;
  private provider: AIProvider;

  constructor(config?: AIClientConfig) {
    this.provider = config?.provider || (process.env.AI_PROVIDER as AIProvider) || 'anthropic';
    const model = config?.model || process.env.AI_MODEL;
    const apiKey = config?.apiKey;

    if (this.provider === 'anthropic') {
      this.anthropic = new AnthropicClient(model, apiKey);
    } else if (this.provider === 'openrouter') {
      this.openrouter = new OpenRouterClient(model, apiKey);
    } else {
      this.openai = new OpenAIClient(model, apiKey);
    }
  }

  async summarize(subject: string, body: string): Promise<SummarizeResult> {
    if (this.anthropic) {
      return this.anthropic.summarize(subject, body);
    }
    if (this.openrouter) {
      return this.openrouter.summarize(subject, body);
    }
    if (this.openai) {
      return this.openai.summarize(subject, body);
    }
    throw new Error('No AI client configured');
  }

  async generateReplies(subject: string, body: string, senderName: string): Promise<QuickReplyResult> {
    if (this.anthropic) {
      return this.anthropic.generateReplies(subject, body, senderName);
    }
    if (this.openrouter) {
      return this.openrouter.generateReplies(subject, body, senderName);
    }
    if (this.openai) {
      return this.openai.generateReplies(subject, body, senderName);
    }
    throw new Error('No AI client configured');
  }

  async generateBrief(prompt: string): Promise<BriefResult> {
    if (this.anthropic) {
      return this.anthropic.generateBrief(prompt);
    }
    if (this.openrouter) {
      return this.openrouter.generateBrief(prompt);
    }
    if (this.openai) {
      return this.openai.generateBrief(prompt);
    }
    throw new Error('No AI client configured');
  }
}

// Singleton instance
let aiClientInstance: AIClient | null = null;

export function getAIClient(config?: AIClientConfig): AIClient {
  if (!aiClientInstance || config) {
    aiClientInstance = new AIClient(config);
  }
  return aiClientInstance;
}

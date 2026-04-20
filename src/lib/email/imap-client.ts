import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptJSON, ImapCredentials, OAuthCredentials } from '@/lib/crypto/encryption';
import type { EmailAccount } from '@/lib/db/schema';

export interface EmailMessage {
  uid: number;
  messageId: string;
  threadId?: string;
  subject: string;
  from: { name?: string; address: string };
  to: Array<{ name?: string; address: string }>;
  cc?: Array<{ name?: string; address: string }>;
  date: Date;
  bodyText?: string;
  bodyHtml?: string;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    contentId?: string;
  }>;
  flags: {
    seen: boolean;
    flagged: boolean;
    draft: boolean;
  };
}

export interface FetchOptions {
  folder?: string;
  limit?: number;
  since?: Date;
  sinceUid?: number;
}

export class ImapClient {
  private client: ImapFlow | null = null;
  private account: EmailAccount;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  private async getConnectionConfig(): Promise<{
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass?: string; accessToken?: string };
  }> {
    if (this.account.provider === 'imap') {
      if (!this.account.credentialsEncrypted) {
        throw new Error('IMAP account missing credentials');
      }

      const creds = decryptJSON<ImapCredentials>(this.account.credentialsEncrypted);

      return {
        host: creds.imapHost,
        port: creds.imapPort || 993,
        secure: creds.imapSecure ?? true,
        auth: {
          user: creds.username,
          pass: creds.password,
        },
      };
    }

    if (this.account.provider === 'gmail' || this.account.provider === 'outlook') {
      if (!this.account.credentialsEncrypted) {
        throw new Error('OAuth account missing credentials');
      }

      const creds = decryptJSON<OAuthCredentials>(this.account.credentialsEncrypted);
      const host = this.account.provider === 'gmail' ? 'imap.gmail.com' : 'outlook.office365.com';

      return {
        host,
        port: 993,
        secure: true,
        auth: {
          user: this.account.externalAccountId,
          accessToken: creds.accessToken,
        },
      };
    }

    throw new Error(`Unsupported provider type: ${this.account.provider}`);
  }

  async connect(): Promise<void> {
    const config = await this.getConnectionConfig();

    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false,
    });

    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
  }

  async fetchEmails(options: FetchOptions = {}): Promise<EmailMessage[]> {
    if (!this.client) {
      throw new Error('Not connected to IMAP server');
    }

    const folder = options.folder || 'INBOX';
    const lock = await this.client.getMailboxLock(folder);

    try {
      const messages: EmailMessage[] = [];
      let query: string;

      if (options.sinceUid) {
        query = `${options.sinceUid}:*`;
      } else if (options.since) {
        const dateStr = options.since.toISOString().split('T')[0];
        query = `SINCE ${dateStr}`;
      } else {
        query = '1:*';
      }

      let count = 0;
      const limit = options.limit || 100;

      for await (const message of this.client.fetch(query, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        flags: true,
        source: true,
      })) {
        if (count >= limit) break;

        const source = message.source;
        if (!source) continue;

        try {
          const parsed = await simpleParser(source as Parameters<typeof simpleParser>[0]);
          const email = this.parseEmail(message.uid, parsed, message.flags ?? new Set<string>());
          messages.push(email);
          count++;
        } catch (parseError) {
          console.error(`Failed to parse message ${message.uid}:`, parseError);
        }
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  private parseEmail(uid: number, parsed: Awaited<ReturnType<typeof simpleParser>>, flags: Set<string>): EmailMessage {
    const from = parsed.from?.value[0] ?? { name: undefined, address: 'unknown@unknown.com' };
    const to = parsed.to
      ? Array.isArray(parsed.to)
        ? parsed.to.flatMap((t) => t.value)
        : parsed.to.value
      : [];
    const cc = parsed.cc
      ? Array.isArray(parsed.cc)
        ? parsed.cc.flatMap((c) => c.value)
        : parsed.cc.value
      : undefined;

    return {
      uid,
      messageId: parsed.messageId || `${uid}@unknown`,
      threadId: parsed.references?.[0] || parsed.inReplyTo || undefined,
      subject: parsed.subject || '(No Subject)',
      from: { name: (from as { name?: string; address: string }).name, address: from.address || 'unknown@unknown.com' },
      to: to.map((t) => ({ name: (t as { name?: string; address?: string }).name, address: t.address || '' })),
      cc: cc?.map((c) => ({ name: (c as { name?: string; address?: string }).name, address: c.address || '' })),
      date: parsed.date || new Date(),
      bodyText: parsed.text || undefined,
      bodyHtml: parsed.html || undefined,
      attachments:
        parsed.attachments?.map((att) => ({
          filename: att.filename || 'attachment',
          mimeType: att.contentType,
          size: att.size,
          contentId: att.contentId || undefined,
        })) || [],
      flags: {
        seen: flags.has('\\Seen'),
        flagged: flags.has('\\Flagged'),
        draft: flags.has('\\Draft'),
      },
    };
  }

  async markAsRead(folder: string, uid: number): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock(folder);
    try {
      await this.client.messageFlagsAdd({ uid }, ['\\Seen']);
    } finally {
      lock.release();
    }
  }

  async markAsUnread(folder: string, uid: number): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock(folder);
    try {
      await this.client.messageFlagsRemove({ uid }, ['\\Seen']);
    } finally {
      lock.release();
    }
  }

  async toggleStar(folder: string, uid: number, starred: boolean): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock(folder);
    try {
      if (starred) {
        await this.client.messageFlagsAdd({ uid }, ['\\Flagged']);
      } else {
        await this.client.messageFlagsRemove({ uid }, ['\\Flagged']);
      }
    } finally {
      lock.release();
    }
  }

  async moveToFolder(fromFolder: string, uid: number, toFolder: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock(fromFolder);
    try {
      await this.client.messageMove({ uid }, toFolder);
    } finally {
      lock.release();
    }
  }

  async deleteMessage(folder: string, uid: number): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock(folder);
    try {
      await this.client.messageFlagsAdd({ uid }, ['\\Deleted']);
      await this.client.messageDelete({ uid });
    } finally {
      lock.release();
    }
  }

  async listFolders(): Promise<Array<{ path: string; name: string }>> {
    if (!this.client) throw new Error('Not connected');

    const list = await this.client.list();
    return list.map((folder) => ({ path: folder.path, name: folder.name }));
  }

  async getMailboxStatus(folder: string): Promise<{ messages: number; unseen: number }> {
    if (!this.client) throw new Error('Not connected');

    const status = await this.client.status(folder, { messages: true, unseen: true });
    return {
      messages: status.messages || 0,
      unseen: status.unseen || 0,
    };
  }
}

// Factory function for creating IMAP clients
export async function createImapClient(account: EmailAccount): Promise<ImapClient> {
  const client = new ImapClient(account);
  await client.connect();
  return client;
}

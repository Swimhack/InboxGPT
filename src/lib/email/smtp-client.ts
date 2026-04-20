import nodemailer, { Transporter } from 'nodemailer';
import { decryptJSON, ImapCredentials, OAuthCredentials } from '@/lib/crypto/encryption';
import type { EmailAccount } from '@/lib/db/schema';

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export class SmtpClient {
  private transporter: Transporter | null = null;
  private account: EmailAccount;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  async connect(): Promise<void> {
    const config = await this.getTransportConfig();
    this.transporter = nodemailer.createTransport(config);
    await this.transporter.verify();
  }

  private async getTransportConfig(): Promise<nodemailer.TransportOptions> {
    if (this.account.provider === 'imap') {
      if (!this.account.credentialsEncrypted) {
        throw new Error('SMTP settings not configured');
      }

      const creds = decryptJSON<ImapCredentials>(this.account.credentialsEncrypted);

      return {
        host: creds.smtpHost,
        port: creds.smtpPort || 587,
        secure: creds.smtpSecure ?? false,
        auth: {
          user: creds.username,
          pass: creds.password,
        },
      } as nodemailer.TransportOptions;
    }

    if (this.account.provider === 'gmail') {
      if (!this.account.credentialsEncrypted) {
        throw new Error('OAuth credentials not configured');
      }

      const creds = decryptJSON<OAuthCredentials>(this.account.credentialsEncrypted);

      return {
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: this.account.externalAccountId,
          accessToken: creds.accessToken,
          refreshToken: creds.refreshToken,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      } as nodemailer.TransportOptions;
    }

    if (this.account.provider === 'outlook') {
      if (!this.account.credentialsEncrypted) {
        throw new Error('OAuth credentials not configured');
      }

      const creds = decryptJSON<OAuthCredentials>(this.account.credentialsEncrypted);

      return {
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          type: 'OAuth2',
          user: this.account.externalAccountId,
          accessToken: creds.accessToken,
        },
      } as nodemailer.TransportOptions;
    }

    throw new Error(`Unsupported provider type: ${this.account.provider}`);
  }

  async sendEmail(options: SendEmailOptions): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new Error('SMTP client not connected');
    }

    const fromDisplay = this.account.displayName || this.account.externalAccountId;
    const mailOptions = {
      from: `${fromDisplay} <${this.account.externalAccountId}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
      inReplyTo: options.inReplyTo,
      references: options.references?.join(' '),
      attachments: options.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    };

    const info = await this.transporter.sendMail(mailOptions);
    return { messageId: info.messageId };
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}

export async function createSmtpClient(account: EmailAccount): Promise<SmtpClient> {
  const client = new SmtpClient(account);
  await client.connect();
  return client;
}

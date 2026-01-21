import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp' }), // NULL = not completed
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),

  // AI fields
  userAnthropicKey: blob('user_anthropic_key', { mode: 'buffer' }), // encrypted
  userOpenaiKey: blob('user_openai_key', { mode: 'buffer' }),       // encrypted
  aiEnabled: integer('ai_enabled', { mode: 'boolean' }).default(false),
});

// Email Accounts table
export const emailAccounts = sqliteTable('email_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  displayName: text('display_name'),
  providerType: text('provider_type', { enum: ['gmail', 'outlook', 'imap'] }).notNull(),

  // IMAP settings (encrypted)
  imapHost: blob('imap_host', { mode: 'buffer' }),
  imapPort: integer('imap_port'),
  imapSecure: integer('imap_secure', { mode: 'boolean' }),
  encryptedCredentials: blob('encrypted_credentials', { mode: 'buffer' }),

  // SMTP settings (encrypted)
  smtpHost: blob('smtp_host', { mode: 'buffer' }),
  smtpPort: integer('smtp_port'),
  smtpSecure: integer('smtp_secure', { mode: 'boolean' }),

  // OAuth tokens (encrypted)
  encryptedAccessToken: blob('encrypted_access_token', { mode: 'buffer' }),
  encryptedRefreshToken: blob('encrypted_refresh_token', { mode: 'buffer' }),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),

  // Sync status
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
  lastSyncUid: integer('last_sync_uid'),
  syncStatus: text('sync_status', { enum: ['idle', 'syncing', 'error'] }).default('idle'),
  syncError: text('sync_error'),

  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Emails table
export const emails = sqliteTable('emails', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => emailAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Email identifiers
  messageId: text('message_id').notNull(),
  threadId: text('thread_id'),
  uid: integer('uid'),

  // Email metadata
  subject: text('subject'),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  toAddresses: text('to_addresses'), // JSON array
  ccAddresses: text('cc_addresses'), // JSON array
  bccAddresses: text('bcc_addresses'), // JSON array
  replyTo: text('reply_to'),

  // Timestamps
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),

  // Content
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  snippet: text('snippet'),
  hasAttachments: integer('has_attachments', { mode: 'boolean' }).default(false),

  // Flags
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  isStarred: integer('is_starred', { mode: 'boolean' }).default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  isDraft: integer('is_draft', { mode: 'boolean' }).default(false),
  isSent: integer('is_sent', { mode: 'boolean' }).default(false),
  folder: text('folder').default('inbox'),
  labels: text('labels'), // JSON array

  // AI fields
  aiSummary: text('ai_summary'),
  aiCategory: text('ai_category', { enum: ['primary', 'social', 'promotions', 'updates', 'forums', 'spam'] }),
  aiPriority: text('ai_priority', { enum: ['urgent', 'high', 'normal', 'low'] }),
  aiSuggestedReplies: text('ai_suggested_replies'), // JSON array
  aiProcessedAt: integer('ai_processed_at', { mode: 'timestamp' }),

  // Indexing
  rawHeaders: text('raw_headers'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Attachments table
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  emailId: text('email_id').notNull().references(() => emails.id, { onDelete: 'cascade' }),

  filename: text('filename').notNull(),
  mimeType: text('mime_type'),
  size: integer('size'),
  contentId: text('content_id'), // For inline attachments
  storagePath: text('storage_path'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Sessions table for NextAuth
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Jobs table for background processing (replaces Redis)
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['email-sync', 'ai-processing'] }).notNull(),
  data: text('data').notNull(), // JSON stringified job data
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  priority: integer('priority').notNull().default(0), // Higher = more urgent
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  error: text('error'),
  result: text('result'), // JSON stringified result
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  scheduledFor: integer('scheduled_for', { mode: 'timestamp' }), // For delayed jobs
});

// AI Usage Tracking
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  date: text('date').notNull(), // YYYY-MM-DD
  emailsProcessed: integer('emails_processed').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  estimatedCostCents: integer('estimated_cost_cents').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  emailAccounts: many(emailAccounts),
  emails: many(emails),
  sessions: many(sessions),
  aiUsage: many(aiUsage),
}));

export const emailAccountsRelations = relations(emailAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [emailAccounts.userId],
    references: [users.id],
  }),
  emails: many(emails),
}));

export const emailsRelations = relations(emails, ({ one, many }) => ({
  account: one(emailAccounts, {
    fields: [emails.accountId],
    references: [emailAccounts.id],
  }),
  user: one(users, {
    fields: [emails.userId],
    references: [users.id],
  }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  email: one(emails, {
    fields: [attachments.emailId],
    references: [emails.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type NewEmailAccount = typeof emailAccounts.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;

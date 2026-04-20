import {
  pgTable,
  text,
  integer,
  bigserial,
  boolean,
  timestamp,
  jsonb,
  uuid,
  primaryKey,
  unique,
  index,
  customType,
  pgEnum,
  inet,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Custom types
// -----------------------------------------------------------------------------
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

const tsvector = customType<{ data: string; default: false; notNull: false }>({
  dataType() {
    return 'tsvector';
  },
});

const vector1536 = customType<{ data: number[]; default: false; notNull: false }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

const citext = customType<{ data: string; default: false }>({
  dataType() {
    return 'citext';
  },
});

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export const channelProvider = pgEnum('channel_provider', [
  'gmail',
  'outlook',
  'imap',
  'twilio',
  'slack',
  'discord',
  'meta_ig',
  'meta_fb',
  'whatsapp',
  'x',
  'linkedin',
  'signal',
]);

export const channelStatus = pgEnum('channel_status', ['active', 'paused', 'error']);

export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'member']);

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);

export const aiCategory = pgEnum('ai_category', [
  'primary',
  'social',
  'promotions',
  'updates',
  'forums',
  'spam',
]);

export const aiPriority = pgEnum('ai_priority', ['urgent', 'high', 'normal', 'low']);

export const jobType = pgEnum('job_type', [
  'channel-sync',
  'normalize-inbound',
  'ai-processing',
  'email-sync',
  'sms-sync',
  'social-sync',
  'phone-sync',
  'transcribe',
  'retention-purge',
]);

export const jobStatus = pgEnum('job_status', ['pending', 'processing', 'completed', 'failed']);

// -----------------------------------------------------------------------------
// Auth.js tables (Drizzle adapter shape)
// -----------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  passwordHash: text('password_hash'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true, mode: 'date' }),
  userAnthropicKey: bytea('user_anthropic_key'),
  userOpenaiKey: bytea('user_openai_key'),
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  })
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

// -----------------------------------------------------------------------------
// Workspace tenancy
// -----------------------------------------------------------------------------
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true, mode: 'date' }),
  kekId: text('kek_id').notNull().default('default'),
  dekWrapped: bytea('dek_wrapped'),
  retentionDays: integer('retention_days').notNull().default(3650),
  quietHours: jsonb('quiet_hours').$type<{ start: string; end: string; timezone: string } | null>(),
  billingCaps: jsonb('billing_caps').$type<Record<string, number>>().default({}),
  featureFlags: jsonb('feature_flags').$type<Record<string, boolean>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
  })
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    role: workspaceRole('role').notNull().default('member'),
    token: text('token').notNull().unique(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    wsEmailIdx: index('invitations_ws_email_idx').on(t.workspaceId, t.email),
  })
);

// -----------------------------------------------------------------------------
// Channels (formerly emailAccounts)
// -----------------------------------------------------------------------------
export const channelAccounts = pgTable(
  'channel_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    provider: channelProvider('provider').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    displayName: text('display_name'),
    status: channelStatus('status').notNull().default('active'),
    credentialsEncrypted: bytea('credentials_encrypted'),
    webhookSecretEncrypted: bytea('webhook_secret_encrypted'),
    cursor: jsonb('cursor').$type<Record<string, unknown>>().default({}),
    scopes: text('scopes').array(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    uniqProvider: unique('channel_accounts_ws_provider_extid_uq').on(
      t.workspaceId,
      t.provider,
      t.externalAccountId
    ),
    wsIdx: index('channel_accounts_ws_idx').on(t.workspaceId),
  })
);

// -----------------------------------------------------------------------------
// Threads & Messages
// -----------------------------------------------------------------------------
export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').references(() => channelAccounts.id, {
      onDelete: 'set null',
    }),
    subject: text('subject'),
    participantKey: text('participant_key'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, mode: 'date' }),
    snippet: text('snippet'),
    unreadCount: integer('unread_count').notNull().default(0),
    isStarred: boolean('is_starred').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    category: aiCategory('category'),
    priority: aiPriority('priority'),
    aiSummary: text('ai_summary'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    wsLastMsgIdx: index('threads_ws_last_msg_idx').on(t.workspaceId, t.lastMessageAt),
    wsParticipantIdx: index('threads_ws_participant_idx').on(t.workspaceId, t.participantKey),
  })
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').references(() => channelAccounts.id, {
      onDelete: 'set null',
    }),
    provider: channelProvider('provider').notNull(),
    providerMessageId: text('provider_message_id').notNull(),
    direction: messageDirection('direction').notNull(),
    fromIdentity: jsonb('from_identity').$type<{ kind: string; value: string; display?: string }>(),
    toIdentities: jsonb('to_identities').$type<Array<{ kind: string; value: string; display?: string }>>(),
    subject: text('subject'),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    snippet: text('snippet'),
    bodyTsv: tsvector('body_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body_text,''))`
    ),
    embedding: vector1536('embedding'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    isRead: boolean('is_read').notNull().default(false),
    isStarred: boolean('is_starred').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    aiSummary: text('ai_summary'),
    aiCategory: aiCategory('ai_category'),
    aiPriority: aiPriority('ai_priority'),
    aiSuggestedReplies: jsonb('ai_suggested_replies').$type<string[]>(),
    aiProcessedAt: timestamp('ai_processed_at', { withTimezone: true, mode: 'date' }),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    uniqProviderMsg: unique('messages_ws_provider_msgid_uq').on(
      t.workspaceId,
      t.provider,
      t.providerMessageId
    ),
    wsReceivedIdx: index('messages_ws_received_idx').on(t.workspaceId, t.receivedAt),
    threadIdx: index('messages_thread_idx').on(t.threadId),
    bodyTsvIdx: index('messages_body_tsv_idx').using('gin', t.bodyTsv),
    embeddingIdx: index('messages_embedding_hnsw_idx').using(
      'hnsw',
      sql`${t.embedding} vector_cosine_ops`
    ),
  })
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    contentId: text('content_id'),
    storageUrl: text('storage_url'),
    sha256: text('sha256'),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    msgIdx: index('attachments_msg_idx').on(t.messageId),
  })
);

// -----------------------------------------------------------------------------
// Identity graph (opt-in cross-channel thread merge)
// -----------------------------------------------------------------------------
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    canonicalContactId: uuid('canonical_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(), // email | phone | slack_user | discord_user | ig_user | x_user | li_user
    value: text('value').notNull(),
    display: text('display'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    uniqIdentity: unique('identities_ws_kind_value_uq').on(t.workspaceId, t.kind, t.value),
    contactIdx: index('identities_contact_idx').on(t.canonicalContactId),
  })
);

// -----------------------------------------------------------------------------
// Audit / webhooks / OAuth state / jobs / AI usage
// -----------------------------------------------------------------------------
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    meta: jsonb('meta'),
    ip: inet('ip'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    wsAtIdx: index('audit_log_ws_at_idx').on(t.workspaceId, t.at),
  })
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: channelProvider('provider').notNull(),
    externalEventId: text('external_event_id').notNull(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    signatureOk: boolean('signature_ok').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    error: text('error'),
    payload: jsonb('payload').notNull(),
  },
  (t) => ({
    uniqEvent: unique('webhook_events_provider_extid_uq').on(t.provider, t.externalEventId),
    providerReceivedIdx: index('webhook_events_provider_received_idx').on(t.provider, t.receivedAt),
  })
);

export const oauthStates = pgTable(
  'oauth_states',
  {
    state: text('state').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: channelProvider('provider').notNull(),
    codeVerifier: text('code_verifier'),
    redirectTo: text('redirect_to'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    expiresIdx: index('oauth_states_expires_idx').on(t.expiresAt),
  })
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    type: jobType('type').notNull(),
    data: jsonb('data').notNull(),
    status: jobStatus('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    error: text('error'),
    result: jsonb('result'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    statusPrioIdx: index('jobs_status_priority_idx').on(t.status, t.priority),
    scheduledIdx: index('jobs_scheduled_idx').on(t.scheduledFor),
  })
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    date: text('date').notNull(), // YYYY-MM-DD UTC
    messagesProcessed: integer('messages_processed').notNull().default(0),
    tokensUsed: integer('tokens_used').notNull().default(0),
    estimatedCostCents: integer('estimated_cost_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    wsDateIdx: index('ai_usage_ws_date_idx').on(t.workspaceId, t.date),
  })
);

export const briefs = pgTable(
  'briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    briefDate: text('brief_date').notNull(),
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    wsDateIdx: unique('briefs_ws_date_uq').on(t.workspaceId, t.briefDate),
  })
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quietHoursStart: text('quiet_hours_start'), // HH:MM
    quietHoursEnd: text('quiet_hours_end'),
    timezone: text('timezone'),
    channelFilters: jsonb('channel_filters').$type<Record<string, boolean>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    wsUserUq: unique('notification_prefs_ws_user_uq').on(t.workspaceId, t.userId),
  })
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
  channelAccounts: many(channelAccounts),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  channelAccounts: many(channelAccounts),
  threads: many(threads),
  messages: many(messages),
  invitations: many(invitations),
  contacts: many(contacts),
  identities: many(identities),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const channelAccountsRelations = relations(channelAccounts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [channelAccounts.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [channelAccounts.userId],
    references: [users.id],
  }),
  messages: many(messages),
  threads: many(threads),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [threads.workspaceId], references: [workspaces.id] }),
  channelAccount: one(channelAccounts, {
    fields: [threads.channelAccountId],
    references: [channelAccounts.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [messages.workspaceId], references: [workspaces.id] }),
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
  channelAccount: one(channelAccounts, {
    fields: [messages.channelAccountId],
    references: [channelAccounts.id],
  }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [contacts.workspaceId], references: [workspaces.id] }),
  identities: many(identities),
}));

export const identitiesRelations = relations(identities, ({ one }) => ({
  workspace: one(workspaces, { fields: [identities.workspaceId], references: [workspaces.id] }),
  contact: one(contacts, { fields: [identities.canonicalContactId], references: [contacts.id] }),
}));

// -----------------------------------------------------------------------------
// Quote leads — public-facing pricing page quote requests (no workspace scope)
// -----------------------------------------------------------------------------
export const quoteLeads = pgTable('quote_leads', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  service: text('service').notNull(),
  budget: text('budget').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export type QuoteLead = typeof quoteLeads.$inferSelect;
export type NewQuoteLead = typeof quoteLeads.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type ChannelAccount = typeof channelAccounts.$inferSelect;
export type NewChannelAccount = typeof channelAccounts.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Identity = typeof identities.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type OAuthState = typeof oauthStates.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;

// Legacy aliases — temporary shim so existing imports compile while Phase 1 refactors land.
// TODO(phase1): remove after callers migrate to channelAccounts/messages/threads.
export const emailAccounts = channelAccounts;
export const emails = messages;
export type EmailAccount = ChannelAccount;
export type NewEmailAccount = NewChannelAccount;
export type Email = Message;
export type NewEmail = NewMessage;

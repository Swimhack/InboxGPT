import type { NextAuthOptions, User as AuthUser } from 'next-auth';
import type { Account, Profile } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { encryptJSON } from '@/lib/crypto/encryption';
import { generateId } from '@/lib/utils';

const allowPassword = process.env.AUTH_ALLOW_PASSWORD === 'true';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const AZURE_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'Mail.ReadWrite',
  'SMTP.Send',
].join(' ');

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

async function ensureUser(opts: { email: string; name?: string | null }): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, opts.email),
  });
  if (existing) return existing.id;

  const id = generateId();
  await db.insert(schema.users).values({
    id,
    email: opts.email,
    name: opts.name ?? opts.email.split('@')[0],
    passwordHash: '',
    aiEnabled: false,
  });
  return id;
}

async function ensureWorkspace(userId: string, displayName: string): Promise<string> {
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.userId, userId),
  });
  if (existing) return existing.workspaceId;

  const first = displayName.split(' ')[0] || 'my';
  let slug = slugify(`${first}-workspace`);
  const clash = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slug, slug),
  });
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const workspaceId = generateId();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    slug,
    name: `${first}'s Workspace`,
  });

  await db.insert(schema.workspaceMembers).values({
    workspaceId,
    userId,
    role: 'owner',
  });

  return workspaceId;
}

async function upsertChannelAccount(opts: {
  workspaceId: string;
  userId: string;
  email: string;
  provider: 'gmail' | 'outlook';
  account: Account;
}) {
  if (!opts.account.access_token) return;

  const credentials = encryptJSON({
    accessToken: opts.account.access_token,
    refreshToken: opts.account.refresh_token ?? null,
    expiresAt: opts.account.expires_at ?? null,
  });

  const existing = await db.query.channelAccounts.findFirst({
    where: and(
      eq(schema.channelAccounts.userId, opts.userId),
      eq(schema.channelAccounts.externalAccountId, opts.email),
      eq(schema.channelAccounts.provider, opts.provider)
    ),
  });

  if (existing) {
    await db
      .update(schema.channelAccounts)
      .set({
        workspaceId: opts.workspaceId,
        credentialsEncrypted: credentials,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(schema.channelAccounts.id, existing.id));
    return;
  }

  await db.insert(schema.channelAccounts).values({
    id: generateId(),
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    externalAccountId: opts.email,
    displayName: opts.email,
    provider: opts.provider,
    credentialsEncrypted: credentials,
    status: 'active',
  });
}

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope: GOOGLE_SCOPES,
                access_type: 'offline',
                prompt: 'consent',
              },
            },
          }),
        ]
      : []),
    ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
            tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
            authorization: { params: { scope: AZURE_SCOPES } },
          }),
        ]
      : []),
    ...(allowPassword
      ? [
          CredentialsProvider({
            name: 'credentials',
            credentials: {
              email: { label: 'Email', type: 'email' },
              password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
              if (!credentials?.email || !credentials?.password) {
                throw new Error('Email and password required');
              }
              const user = await db.query.users.findFirst({
                where: eq(schema.users.email, credentials.email),
              });
              if (!user || !user.passwordHash) throw new Error('Invalid credentials');
              const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
              if (!isValid) throw new Error('Invalid credentials');
              return { id: user.id, email: user.email, name: user.name ?? user.email };
            },
          }),
        ]
      : []),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }: { user: AuthUser; account: Account | null; profile?: Profile }) {
      try {
        const email = user.email || (profile as any)?.email;
        if (!email) return false;

        const userId = await ensureUser({
          email,
          name: user.name ?? (profile as any)?.name ?? null,
        });
        (user as any).id = userId;

        const workspaceId = await ensureWorkspace(userId, user.name || email);

        if (account?.provider === 'google') {
          await upsertChannelAccount({ workspaceId, userId, email, provider: 'gmail', account });
        } else if (account?.provider === 'azure-ad') {
          await upsertChannelAccount({ workspaceId, userId, email, provider: 'outlook', account });
        }

        return true;
      } catch (err) {
        console.error('[auth] signIn callback failed', err);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
};

export async function registerUser(email: string, password: string, name?: string) {
  if (!allowPassword) throw new Error('Password sign-up is disabled');

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (existing) throw new Error('User already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const id = generateId();
  await db.insert(schema.users).values({
    id,
    email,
    name: name || email.split('@')[0],
    passwordHash,
  });

  return { id, email, name };
}

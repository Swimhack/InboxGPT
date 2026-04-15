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

async function ensureUser(opts: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, opts.email),
  });
  if (existing) {
    if (opts.image && existing.image !== opts.image) {
      await db
        .update(schema.users)
        .set({ image: opts.image, updatedAt: new Date() })
        .where(eq(schema.users.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await db
    .insert(schema.users)
    .values({
      email: opts.email,
      name: opts.name ?? opts.email.split('@')[0],
      image: opts.image ?? null,
      aiEnabled: false,
    })
    .returning({ id: schema.users.id });
  return row.id;
}

async function ensureWorkspace(userId: string, displayName: string): Promise<string> {
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(schema.workspaceMembers.userId, userId),
  });
  if (existing) return existing.workspaceId;

  const first = displayName.split(' ')[0] || 'my';
  let slug = slugify(`${first}-workspace`);
  // Make slug unique on collision.
  const clash = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.slug, slug),
  });
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const [ws] = await db
    .insert(schema.workspaces)
    .values({
      slug,
      name: `${first}'s Workspace`,
    })
    .returning({ id: schema.workspaces.id });

  await db.insert(schema.workspaceMembers).values({
    workspaceId: ws.id,
    userId,
    role: 'owner',
  });

  return ws.id;
}

async function upsertGoogleChannel(opts: {
  workspaceId: string;
  userId: string;
  email: string;
  account: Account;
}) {
  if (!opts.account.access_token) return;
  const credentials = encryptJSON({
    accessToken: opts.account.access_token,
    refreshToken: opts.account.refresh_token ?? null,
    expiresAt: opts.account.expires_at ?? null,
    scope: opts.account.scope ?? null,
    tokenType: opts.account.token_type ?? null,
    idToken: opts.account.id_token ?? null,
  });

  const existing = await db.query.channelAccounts.findFirst({
    where: and(
      eq(schema.channelAccounts.workspaceId, opts.workspaceId),
      eq(schema.channelAccounts.provider, 'gmail'),
      eq(schema.channelAccounts.externalAccountId, opts.email)
    ),
  });

  if (existing) {
    await db
      .update(schema.channelAccounts)
      .set({
        credentialsEncrypted: credentials,
        status: 'active',
        userId: opts.userId,
        displayName: opts.email,
        scopes: opts.account.scope?.split(' ') ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.channelAccounts.id, existing.id));
    return;
  }

  await db.insert(schema.channelAccounts).values({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    provider: 'gmail',
    externalAccountId: opts.email,
    displayName: opts.email,
    status: 'active',
    credentialsEncrypted: credentials,
    scopes: opts.account.scope?.split(' ') ?? null,
  });
}

async function upsertOutlookChannel(opts: {
  workspaceId: string;
  userId: string;
  email: string;
  account: Account;
}) {
  if (!opts.account.access_token) return;
  const credentials = encryptJSON({
    accessToken: opts.account.access_token,
    refreshToken: opts.account.refresh_token ?? null,
    expiresAt: opts.account.expires_at ?? null,
    scope: opts.account.scope ?? null,
    tokenType: opts.account.token_type ?? null,
    idToken: opts.account.id_token ?? null,
  });

  const existing = await db.query.channelAccounts.findFirst({
    where: and(
      eq(schema.channelAccounts.workspaceId, opts.workspaceId),
      eq(schema.channelAccounts.provider, 'outlook'),
      eq(schema.channelAccounts.externalAccountId, opts.email)
    ),
  });

  if (existing) {
    await db
      .update(schema.channelAccounts)
      .set({
        credentialsEncrypted: credentials,
        status: 'active',
        userId: opts.userId,
        displayName: opts.email,
        scopes: opts.account.scope?.split(' ') ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.channelAccounts.id, existing.id));
    return;
  }

  await db.insert(schema.channelAccounts).values({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    provider: 'outlook',
    externalAccountId: opts.email,
    displayName: opts.email,
    status: 'active',
    credentialsEncrypted: credentials,
    scopes: opts.account.scope?.split(' ') ?? null,
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
              return { id: user.id, email: user.email, name: user.name ?? undefined };
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
          image: (user as any).image ?? (profile as any)?.picture ?? null,
        });
        (user as any).id = userId;

        const workspaceId = await ensureWorkspace(userId, user.name || email);

        if (account?.provider === 'google') {
          await upsertGoogleChannel({ workspaceId, userId, email, account });
        } else if (account?.provider === 'azure-ad') {
          await upsertOutlookChannel({ workspaceId, userId, email, account });
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
  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      name: name || email.split('@')[0],
      passwordHash,
    })
    .returning({ id: schema.users.id });

  return { id: row.id, email, name };
}

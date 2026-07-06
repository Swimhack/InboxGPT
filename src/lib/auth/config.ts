import { type NextAuthOptions, type User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateId } from '@/lib/utils';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await db.query.users.findFirst({
            where: eq(schema.users.email, credentials.email),
          });

          if (!user || !user.passwordHash) {
            return null;
          }

          const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

          if (!isValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email.split('@')[0],
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        // Find existing user by login email ONLY. We deliberately do NOT
        // match against channel_accounts.externalAccountId: controlling a
        // connected mailbox (e.g. a shared support@ inbox) must never grant
        // ownership of the platform user that connected it. The previous
        // "adoption" path here was an account-takeover vector — it handed
        // the owning user's entire account (and rewrote their login email)
        // to whoever signed in with Google as the connected address.
        const existing = await db.query.users.findFirst({
          where: eq(schema.users.email, user.email),
        });

        if (!existing) {
          const id = generateId();
          await db.insert(schema.users).values({
            id,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            passwordHash: '',
          });
          user.id = id;
        } else {
          user.id = existing.id;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      // Always resolve user ID from DB by email — the JWT may carry a
      // stale ID from before a database migration (e.g. SQLite → Postgres).
      if (token.email) {
        const dbUser = await db.query.users.findFirst({
          where: eq(schema.users.email, token.email as string),
          columns: { id: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
};

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    throw new Error('User already exists');
  }

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

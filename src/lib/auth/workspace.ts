import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaceMembers, workspaces } from '@/lib/db/schema';
import { getCurrentUser } from './session';

const WORKSPACE_COOKIE = 'ig_workspace';

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * Resolve the active workspace for the current request.
 * Order of precedence:
 *   1. `ig_workspace` cookie (set via workspace switcher)
 *   2. First membership in `workspace_members` (stable ordering by created_at)
 *
 * Throws redirect('/login') if not authed, or redirect('/onboarding/welcome')
 * if the user has no memberships yet (zero-click workspace creation happens
 * in the Google sign-in callback; hitting this branch means onboarding was
 * skipped/aborted).
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/login');

  const userId = user.id as string;
  const cookieStore = await cookies();
  const preferred = cookieStore.get(WORKSPACE_COOKIE)?.value;

  if (preferred) {
    const hit = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        slug: workspaces.slug,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, preferred)))
      .limit(1);

    if (hit[0]) {
      return {
        userId,
        workspaceId: hit[0].workspaceId,
        workspaceSlug: hit[0].slug,
        role: hit[0].role,
      };
    }
  }

  const fallback = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      slug: workspaces.slug,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.createdAt)
    .limit(1);

  if (!fallback[0]) redirect('/welcome');

  return {
    userId,
    workspaceId: fallback[0].workspaceId,
    workspaceSlug: fallback[0].slug,
    role: fallback[0].role,
  };
}

/** Same as requireWorkspace but returns null instead of redirecting. */
export async function getWorkspace(): Promise<WorkspaceContext | null> {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const userId = user.id as string;
  const cookieStore = await cookies();
  const preferred = cookieStore.get(WORKSPACE_COOKIE)?.value;

  const rows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      slug: workspaces.slug,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.createdAt);

  if (!rows.length) return null;

  const chosen = (preferred && rows.find((r) => r.workspaceId === preferred)) || rows[0];
  return {
    userId,
    workspaceId: chosen.workspaceId,
    workspaceSlug: chosen.slug,
    role: chosen.role,
  };
}

export async function setActiveWorkspace(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export const WORKSPACE_COOKIE_NAME = WORKSPACE_COOKIE;

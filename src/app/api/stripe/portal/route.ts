import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireWorkspace } from '@/lib/auth/workspace';
import { createPortalSession } from '@/lib/stripe/checkout';

export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await requireWorkspace();
  const baseUrl = process.env.NEXTAUTH_URL || 'https://inboxgpt.fly.dev';

  try {
    const portalSession = await createPortalSession({
      workspaceId: workspace.workspaceId,
      returnUrl: `${baseUrl}/settings`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not open billing portal' },
      { status: 400 }
    );
  }
}

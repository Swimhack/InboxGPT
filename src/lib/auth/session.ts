import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import { redirect } from 'next/navigation';

export async function getSession() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();

  if (!session?.user) {
    return null;
  }

  return session.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

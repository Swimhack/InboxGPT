import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function WelcomePage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  redirect('/connect-email');
}

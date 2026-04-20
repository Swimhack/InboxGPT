import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { OnboardingProgressBar } from '@/components/onboarding/progress-bar';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <OnboardingProgressBar />
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}

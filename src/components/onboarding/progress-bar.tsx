'use client';

import { usePathname } from 'next/navigation';

const PCT: Record<string, number> = {
  '/welcome': 25,
  '/connect-channels': 60,
  '/connect-email': 60,
  '/complete': 100,
};

export function OnboardingProgressBar() {
  const path = usePathname();
  const pct = PCT[path] ?? 0;
  return (
    <div className="fixed top-0 left-0 right-0 h-1 bg-muted z-50">
      <div
        className="h-full bg-primary transition-all duration-500"
        style={{ width: `${pct}%` }}
        aria-label="onboarding-progress"
      />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, Mail, Sparkles, ArrowRight } from 'lucide-react';

export default function CompletePage() {
  const router = useRouter();
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'processing' | 'done'>('syncing');
  const [emailCount, setEmailCount] = useState(0);

  // Update progress bar
  useEffect(() => {
    const progress = document.getElementById('onboarding-progress');
    if (progress) progress.style.width = '100%';
  }, []);

  // Simulate sync progress
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Simulate finding emails
        if (prev < 60) {
          setEmailCount(Math.floor(prev * 2.5)); // ~150 emails at 60%
        }
        return prev + Math.random() * 8;
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // Update status based on progress
  useEffect(() => {
    if (syncProgress >= 60 && syncStatus === 'syncing') {
      setSyncStatus('processing');
    }
    if (syncProgress >= 100 && syncStatus === 'processing') {
      // Mark onboarding complete
      fetch('/api/user/onboarding', { method: 'POST' }).catch(console.error);
      setTimeout(() => setSyncStatus('done'), 500);
    }
  }, [syncProgress, syncStatus]);

  // Clear onboarding flag from session
  useEffect(() => {
    sessionStorage.removeItem('onboardingInProgress');
  }, []);

  const handleGoToInbox = () => {
    router.push('/inbox');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardContent className="pt-8 pb-6 text-center space-y-6">
          {/* Status Icon */}
          <div className="relative inline-flex">
            {syncStatus === 'done' ? (
              <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-in zoom-in duration-300">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                {syncStatus === 'syncing' ? (
                  <Mail className="h-10 w-10 text-primary animate-pulse" />
                ) : (
                  <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Status Text */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">
              {syncStatus === 'syncing' && 'Syncing Your Emails...'}
              {syncStatus === 'processing' && 'AI is Analyzing...'}
              {syncStatus === 'done' && "You're All Set!"}
            </h1>
            <p className="text-muted-foreground">
              {syncStatus === 'syncing' && `Found ${emailCount} emails so far`}
              {syncStatus === 'processing' && 'Creating summaries and organizing your inbox'}
              {syncStatus === 'done' && 'Your emails are ready to explore'}
            </p>
          </div>

          {/* Progress Bar */}
          {syncStatus !== 'done' && (
            <div className="w-full max-w-xs mx-auto space-y-2">
              <Progress value={syncProgress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {syncStatus === 'syncing' ? 'Fetching emails' : 'AI processing'}
                </span>
                <span>{Math.min(Math.round(syncProgress), 100)}%</span>
              </div>
            </div>
          )}

          {/* Feature Highlights (shown when done) */}
          {syncStatus === 'done' && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{emailCount}</div>
                <div className="text-xs text-muted-foreground">Emails synced</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">AI</div>
                <div className="text-xs text-muted-foreground">Summaries ready</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">Auto</div>
                <div className="text-xs text-muted-foreground">Organized</div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter>
          <Button
            size="lg"
            className="w-full"
            onClick={handleGoToInbox}
            disabled={syncStatus !== 'done'}
          >
            {syncStatus !== 'done' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Please wait...
              </>
            ) : (
              <>
                Go to Inbox
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Tips while waiting */}
      {syncStatus !== 'done' && (
        <div className="text-center space-y-2 animate-in fade-in delay-500 duration-500">
          <p className="text-sm text-muted-foreground">
            Tip: InboxGPT will continue syncing in the background
          </p>
        </div>
      )}
    </div>
  );
}

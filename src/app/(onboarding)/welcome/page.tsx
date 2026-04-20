'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Sparkles, FolderOpen, Zap, ArrowRight } from 'lucide-react';

export default function WelcomePage() {
  const router = useRouter();

  const features = [
    {
      icon: Mail,
      title: 'Unified Inbox',
      description: 'See all your emails in one place',
    },
    {
      icon: Sparkles,
      title: 'Smart Summaries',
      description: 'AI summarizes long emails for you',
    },
    {
      icon: FolderOpen,
      title: 'Auto-Organize',
      description: 'Emails sorted by importance',
    },
    {
      icon: Zap,
      title: 'Quick Replies',
      description: 'AI suggests responses',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-2">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome to InboxGPT</h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Your AI-powered email assistant that helps you stay organized and respond faster.
        </p>
      </div>

      {/* Features */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push('/connect-channels')}
          >
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Takes less than 2 minutes to set up
          </p>
        </CardFooter>
      </Card>

      {/* Trust indicators */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          Privacy-first
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          Your data stays yours
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          AES-256 encrypted
        </div>
      </div>
    </div>
  );
}

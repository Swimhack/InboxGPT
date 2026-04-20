'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, CheckCircle, XCircle } from 'lucide-react';

type InviteInfo = {
  email: string;
  role: string;
  workspaceName: string;
  expiresAt: string;
};

type PageState = 'loading' | 'valid' | 'accepting' | 'accepted' | 'error';

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [state, setState] = useState<PageState>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t);
      fetch(`/api/invitations/${t}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setErrorMsg(data.error);
            setState('error');
          } else {
            setInvite(data);
            setState('valid');
          }
        })
        .catch(() => {
          setErrorMsg('Could not load invitation. Please try again.');
          setState('error');
        });
    });
  }, [params]);

  const handleAccept = async () => {
    setState('accepting');
    try {
      const res = await fetch(`/api/invitations/${token}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setErrorMsg(data.error);
        setState('error');
      } else {
        setState('accepted');
        setTimeout(() => router.push('/inbox'), 2000);
      }
    } catch {
      setErrorMsg('Failed to accept invitation. Please try again.');
      setState('error');
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>{errorMsg}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
              Go to login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (state === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-2" />
            <CardTitle>You&apos;re in!</CardTitle>
            <CardDescription>Redirecting you to the inbox…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You&apos;ve been invited</CardTitle>
          <CardDescription>
            Join <strong>{invite?.workspaceName}</strong> on InboxGPT as a{' '}
            <strong>{invite?.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>Accepting as: <strong>{invite?.email}</strong></p>
          <p className="mt-1">
            Expires: {invite ? new Date(invite.expiresAt).toLocaleDateString() : ''}
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={state === 'accepting'}
          >
            {state === 'accepting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept invitation
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
            Sign in with a different account
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

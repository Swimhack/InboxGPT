'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, Copy, Check } from 'lucide-react';

type Member = {
  userId: string;
  name: string | null;
  email: string;
  role: string;
};

interface TeamSettingsProps {
  members: Member[];
  canInvite: boolean;
}

export function TeamSettings({ members, canInvite }: TeamSettingsProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'member' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to send invitation');
        setStatus('error');
      } else {
        setInviteUrl(data.inviteUrl || '');
        setStatus('done');
        setEmail('');
      }
    } catch {
      setErrorMsg('Network error — please try again');
      setStatus('error');
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>{members.length} member{members.length !== 1 ? 's' : ''} in this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.userId} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{m.name || m.email}</p>
                  {m.name && <p className="text-xs text-muted-foreground">{m.email}</p>}
                </div>
                <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} className="capitalize">
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a team member</CardTitle>
            <CardDescription>They&apos;ll receive an email with a join link valid for 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'done' ? (
              <div className="space-y-3">
                <p className="text-sm text-green-700 dark:text-green-400">
                  Invitation sent! Share this link if the email doesn&apos;t arrive:
                </p>
                {inviteUrl && (
                  <div className="flex gap-2">
                    <Input readOnly value={inviteUrl} className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={copyLink}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => setStatus('idle')}>
                  Invite another
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="flex gap-2">
                <Input
                  type="email"
                  required
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'sending'}
                />
                <Button type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">Invite</span>
                </Button>
              </form>
            )}
            {status === 'error' && (
              <p className="text-sm text-destructive mt-2">{errorMsg}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

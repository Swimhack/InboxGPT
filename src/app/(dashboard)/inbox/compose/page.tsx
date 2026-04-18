'use client';

import { apiUrl } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Send, Loader2, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

interface Account {
  id: string;
  email: string;
  displayName: string | null;
}

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const [form, setForm] = useState({
    accountId: searchParams.get('accountId') || '',
    to: searchParams.get('replyTo') || '',
    cc: '',
    bcc: '',
    subject: searchParams.get('subject') || '',
    body: searchParams.get('body') || '',
    inReplyTo: searchParams.get('inReplyTo') || '',
  });

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch(apiUrl('/api/accounts'));
        const data = await res.json();
        setAccounts(data.accounts || []);
        if (data.accounts?.length > 0 && !form.accountId) {
          setForm((f) => ({ ...f, accountId: data.accounts[0].id }));
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
      } finally {
        setIsFetching(false);
      }
    }
    fetchAccounts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.accountId) {
      toast({
        title: 'Error',
        description: 'Please select an account to send from',
        variant: 'destructive',
      });
      return;
    }

    if (!form.to) {
      toast({
        title: 'Error',
        description: 'Please enter a recipient email',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(apiUrl('/api/emails/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: form.accountId,
          to: form.to.split(',').map((e) => e.trim()),
          cc: form.cc ? form.cc.split(',').map((e) => e.trim()) : undefined,
          bcc: form.bcc ? form.bcc.split(',').map((e) => e.trim()) : undefined,
          subject: form.subject,
          body: form.body,
          isHtml: false,
          inReplyTo: form.inReplyTo || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      toast({
        title: 'Email sent',
        description: 'Your email has been sent successfully',
      });

      window.location.href = '/inbox/inbox';
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send email',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inbox">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Compose Email</h1>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              You need to add an email account before you can send emails.
            </p>
            <Button asChild>
              <Link href="/accounts">Add Account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>New Message</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from">From</Label>
                <select
                  id="from"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName || account.email} &lt;{account.email}&gt;
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="text"
                  placeholder="recipient@example.com"
                  value={form.to}
                  onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple recipients with commas
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cc">CC</Label>
                  <Input
                    id="cc"
                    type="text"
                    placeholder="cc@example.com"
                    value={form.cc}
                    onChange={(e) => setForm((f) => ({ ...f, cc: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bcc">BCC</Label>
                  <Input
                    id="bcc"
                    type="text"
                    placeholder="bcc@example.com"
                    value={form.bcc}
                    onChange={(e) => setForm((f) => ({ ...f, bcc: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  type="text"
                  placeholder="Email subject"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  placeholder="Write your message..."
                  className="min-h-[300px]"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <Button type="button" variant="outline" disabled>
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach Files
                </Button>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" asChild>
                    <Link href="/inbox">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

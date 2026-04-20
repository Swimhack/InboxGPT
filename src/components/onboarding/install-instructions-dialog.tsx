'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { ChannelDef } from '@/lib/channels/catalog';

interface InstallInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  def: ChannelDef | null;
  appBaseUrl: string;
}

export function InstallInstructionsDialog({
  open,
  onOpenChange,
  def,
  appBaseUrl,
}: InstallInstructionsDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!def || def.strategy.kind !== 'install-doc') return null;

  const webhookUrl = `${appBaseUrl}${def.strategy.webhookPath}`;
  const docUrl = def.strategy.docUrl;

  const copy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stepsByProvider: Record<string, string[]> = {
    slack: [
      `Create a Slack app at ${docUrl} and pick "From scratch".`,
      'Under "Event Subscriptions", enable events and paste the webhook URL below as the Request URL.',
      'Subscribe to the bot events: message.im, app_mention, message.channels.',
      'Install the app to your workspace, then copy the Bot User OAuth Token.',
      'Paste the Bot Token into InboxGPT → Settings → Integrations → Slack.',
    ],
    discord: [
      `Create a Discord application at ${docUrl}.`,
      'Add a bot user and copy its token.',
      'Under Interactions Endpoint URL, paste the webhook URL below.',
      'Invite the bot to your server with the applications.commands and bot scopes.',
      'Paste the bot token into InboxGPT → Settings → Integrations → Discord.',
    ],
  };
  const steps = stepsByProvider[def.id] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up {def.name}</DialogTitle>
          <DialogDescription>
            {def.name} needs a one-time setup in your admin console. Follow these steps:
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal pl-5 space-y-2 text-sm">
          {steps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Webhook URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
              {webhookUrl}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" asChild>
            <a href={docUrl} target="_blank" rel="noopener noreferrer">
              Open {def.name} console
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

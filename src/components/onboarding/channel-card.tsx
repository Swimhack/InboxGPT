'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BrandIcons } from '@/components/brand-icons';
import type { ChannelDef } from '@/lib/channels/catalog';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';

export type ChannelCardState = 'ready' | 'connected' | 'coming-soon';

export interface ConnectedAccount {
  email: string;
  name: string | null;
}

interface ChannelCardProps {
  def: ChannelDef;
  state: ChannelCardState;
  connectedAccounts?: ConnectedAccount[];
  comingSoonReason?: string;
  busy?: boolean;
  onConnect: (def: ChannelDef) => void;
}

export function ChannelCard({
  def,
  state,
  connectedAccounts = [],
  comingSoonReason,
  busy,
  onConnect,
}: ChannelCardProps) {
  const Icon = BrandIcons[def.iconKey];
  const disabled = state === 'coming-soon' || busy;
  const connectedCount = connectedAccounts.length;

  const buttonLabel = (() => {
    if (busy) return 'Connecting…';
    if (state === 'coming-soon') return 'Coming soon';
    if (state === 'connected') return 'Add another';
    if (def.strategy.kind === 'imap-dialog') return 'Connect';
    if (def.strategy.kind === 'install-doc') return 'Set up';
    return 'Connect';
  })();

  const defaultComingSoonReason =
    def.strategy.kind === 'coming-soon' ? def.strategy.reason : undefined;
  const tooltipText =
    state === 'coming-soon' ? comingSoonReason ?? defaultComingSoonReason ?? 'Available in the next release.' : null;

  const buttonEl = (
    <Button
      type="button"
      size="sm"
      variant={state === 'connected' ? 'outline' : 'default'}
      className="w-full"
      disabled={disabled}
      onClick={() => !disabled && onConnect(def)}
      data-testid={`channel-connect-${def.id}`}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : state === 'connected' ? (
        <Plus className="mr-2 h-4 w-4" />
      ) : null}
      {buttonLabel}
    </Button>
  );

  return (
    <Card className="p-4 flex flex-col gap-3 min-h-[160px]" data-testid={`channel-card-${def.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{def.name}</div>
          </div>
        </div>
        {state === 'connected' ? (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1 border-0">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </Badge>
        ) : state === 'coming-soon' ? (
          <Badge variant="secondary" className="text-muted-foreground">
            Coming soon
          </Badge>
        ) : null}
      </div>

      {state === 'connected' && connectedAccounts.length > 0 ? (
        <ul
          className="text-sm text-muted-foreground space-y-1 flex-1"
          data-testid={`channel-accounts-${def.id}`}
        >
          {connectedAccounts.slice(0, 3).map((a) => (
            <li key={a.email} className="truncate">
              {a.email}
            </li>
          ))}
          {connectedAccounts.length > 3 ? (
            <li className="text-xs">+{connectedAccounts.length - 3} more</li>
          ) : null}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{def.description}</p>
      )}

      {tooltipText ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full inline-block">{buttonEl}</span>
            </TooltipTrigger>
            <TooltipContent>{tooltipText}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttonEl
      )}

      {state === 'connected' && connectedCount > 1 ? (
        <div className="text-xs text-muted-foreground text-right">
          {connectedCount} connected
        </div>
      ) : null}
    </Card>
  );
}

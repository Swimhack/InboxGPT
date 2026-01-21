'use client';

import { HelpCircle, FileText, FolderOpen, AlertTriangle, MessageSquare, Sparkles } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type LucideIcon } from 'lucide-react';

interface AIFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  example: string;
}

const AI_FEATURES: Record<string, AIFeature> = {
  summary: {
    icon: FileText,
    title: 'Smart Summary',
    description:
      'AI reads your email and creates a 2-3 sentence summary so you can quickly understand the key points without reading the whole thing.',
    example: '"Meeting rescheduled to Thursday 3pm. Please confirm attendance by EOD."',
  },
  category: {
    icon: FolderOpen,
    title: 'Auto-Categorization',
    description:
      'Emails are automatically sorted into categories based on their content. This helps you focus on what matters most.',
    example: 'Newsletters → Promotions, LinkedIn → Social, Bank alerts → Updates',
  },
  priority: {
    icon: AlertTriangle,
    title: 'Priority Detection',
    description:
      'AI identifies urgent emails that need your immediate attention based on deadlines, action items, and urgency cues.',
    example: 'Red dot = Urgent, Orange = High priority, Gray = Normal',
  },
  replies: {
    icon: MessageSquare,
    title: 'Quick Replies',
    description:
      'Get AI-suggested responses you can use or edit. Save time on common responses while keeping your personal touch.',
    example: '"Thanks for the update, I\'ll review and get back to you by tomorrow."',
  },
};

interface AIExplainerProps {
  /** Which AI feature to explain */
  feature: keyof typeof AI_FEATURES;
  /** Use inline variant (smaller) */
  inline?: boolean;
}

/**
 * AIExplainer - Tooltip explaining what an AI feature does
 *
 * Add this next to AI feature headers to help users understand
 * what the AI is doing and why.
 */
export function AIExplainer({ feature, inline = false }: AIExplainerProps) {
  const info = AI_FEATURES[feature];
  if (!info) return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`text-muted-foreground hover:text-foreground transition-colors ${
              inline ? 'ml-1' : ''
            }`}
            aria-label={`Learn about ${info.title}`}
          >
            <HelpCircle className={inline ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <info.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-sm">{info.title}</p>
              <p className="text-xs text-muted-foreground">{info.description}</p>
              <div className="text-xs bg-muted p-2 rounded italic">
                Example: {info.example}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * AIFeatureCard - A card explaining an AI feature
 *
 * Use in settings or help pages for more detailed explanations.
 */
export function AIFeatureCard({ feature }: { feature: keyof typeof AI_FEATURES }) {
  const info = AI_FEATURES[feature];
  if (!info) return null;

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <info.icon className="h-5 w-5 text-primary" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold">{info.title}</h3>
        <p className="text-sm text-muted-foreground">{info.description}</p>
        <p className="text-xs text-muted-foreground italic mt-2">
          Example: {info.example}
        </p>
      </div>
    </div>
  );
}

/**
 * AIBadge - Shows that something is AI-powered
 */
export function AIBadge({ label = 'AI' }: { label?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
            <Sparkles className="h-3 w-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Powered by AI</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * AIProcessingNote - Explains that AI is still working
 */
export function AIProcessingNote() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded bg-muted/50">
      <Sparkles className="h-3 w-3 animate-pulse text-purple-500" />
      <span>AI is analyzing this email. Summary and suggestions will appear shortly.</span>
    </div>
  );
}

/**
 * AIPrivacyNote - Explains how AI handles data
 */
export function AIPrivacyNote() {
  return (
    <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/30 border">
      <div className="flex items-center gap-2 font-medium">
        <Sparkles className="h-3 w-3 text-primary" />
        About AI Features
      </div>
      <p>
        Your emails are sent to our AI provider (Anthropic Claude or OpenAI) for analysis.
        The AI does not store your emails - they are only processed in real-time to generate
        summaries and suggestions.
      </p>
      <p className="text-muted-foreground/70">
        You can disable AI features in Settings if you prefer.
      </p>
    </div>
  );
}

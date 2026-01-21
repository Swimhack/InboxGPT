'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Lock } from 'lucide-react';

interface AISettingsProps {
    hasAnthropicKey: boolean;
    hasOpenaiKey: boolean;
    usageInfo?: {
        freeUsed: number;
        freeLimit: number;
        isLimitReached: boolean;
    }
}

export function AISettings({ hasAnthropicKey, hasOpenaiKey, usageInfo }: AISettingsProps) {
    const { toast } = useToast();
    const [anthropicKey, setAnthropicKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/settings/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    anthropicKey: anthropicKey || undefined, // Only send if changed
                    openaiKey: openaiKey || undefined
                }),
            });

            if (!res.ok) throw new Error('Failed to save settings');

            toast({ title: 'Settings saved', description: 'Your API keys have been updated securely.' });

            // Reset inputs
            setAnthropicKey('');
            setOpenaiKey('');

            // Ideally refresh the page to update "hasKey" status
            window.location.reload();

        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update settings', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>AI Settings</CardTitle>
                <CardDescription>Configure AI provider settings and Manage your API keys</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Usage Info */}
                {usageInfo && !hasAnthropicKey && !hasOpenaiKey && (
                    <div className="bg-muted p-4 rounded-lg flex items-start gap-3">
                        <div className="text-sm">
                            <p className="font-medium">Free Tier Usage</p>
                            <p className="text-muted-foreground">
                                {usageInfo.freeUsed} / {usageInfo.freeLimit} emails processed
                            </p>
                            {usageInfo.isLimitReached && (
                                <p className="text-red-600 font-medium mt-1">
                                    Limit reached. Add your own API key to continue.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="anthropic">Anthropic API Key (Claude)</Label>
                        <div className="relative">
                            <Input
                                id="anthropic"
                                type="password"
                                placeholder={hasAnthropicKey ? '•••••••••••••••• (Key set)' : 'sk-ant-...'}
                                value={anthropicKey}
                                onChange={(e) => setAnthropicKey(e.target.value)}
                            />
                            {hasAnthropicKey && !anthropicKey && (
                                <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Required for Smart Summary and Auto-Reply features.
                            <a href="https://console.anthropic.com/settings/keys" target="_blank" className="ml-1 underline">Get key</a>
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="openai">OpenAI API Key (GPT-4)</Label>
                        <div className="relative">
                            <Input
                                id="openai"
                                type="password"
                                placeholder={hasOpenaiKey ? '•••••••••••••••• (Key set)' : 'sk-...'}
                                value={openaiKey}
                                onChange={(e) => setOpenaiKey(e.target.value)}
                            />
                            {hasOpenaiKey && !openaiKey && (
                                <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Alternative provider.
                            <a href="https://platform.openai.com/api-keys" target="_blank" className="ml-1 underline">Get key</a>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Keys are encrypted at rest and never shared with anyone.
                </div>

                <Button onClick={handleSave} disabled={isLoading || (!anthropicKey && !openaiKey)}>
                    {isLoading ? 'Saving...' : 'Save API Settings'}
                </Button>
            </CardContent>
        </Card>
    );
}

import { requireAuth } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db, schema } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserUsage, AI_LIMITS } from '@/lib/ai/limits';
import { AISettings } from '@/components/settings/ai-settings';
import { BillingActions } from '@/components/settings/billing-actions';
import { requireWorkspace } from '@/lib/auth/workspace';
import type { PlanId } from '@/lib/stripe/plans';

export default async function SettingsPage() {
  const user = await requireAuth();
  const workspaceCtx = await requireWorkspace();

  const [fullUser, workspaceRows] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: {
        userAnthropicKey: true,
        userOpenaiKey: true
      }
    }),
    db
      .select({ plan: schema.workspaces.plan, stripeSubscriptionId: schema.workspaces.stripeSubscriptionId })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceCtx.workspaceId))
      .limit(1),
  ]);

  const workspace = workspaceRows[0];

  const usage = await getUserUsage(user.id);
  const usageInfo = {
    freeUsed: usage.totalEmailsProcessed,
    freeLimit: AI_LIMITS.FREE_TIER_EMAILS_PER_USER,
    isLimitReached: usage.totalEmailsProcessed >= AI_LIMITS.FREE_TIER_EMAILS_PER_USER
  };

  const currentPlan = (workspace?.plan ?? 'free') as PlanId;
  const hasSubscription = !!workspace?.stripeSubscriptionId;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-12">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Manage your account settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" defaultValue={user.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={user.email} disabled />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <AISettings
            hasAnthropicKey={!!fullUser?.userAnthropicKey}
            hasOpenaiKey={!!fullUser?.userOpenaiKey}
            usageInfo={usageInfo}
          />
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
              <CardDescription>
                Manage your subscription and billing information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">Current Plan</p>
                  <p className="text-sm text-muted-foreground capitalize">{currentPlan}</p>
                </div>
              </div>
              <BillingActions currentPlan={currentPlan} hasSubscription={hasSubscription} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure notification preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Notification settings coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

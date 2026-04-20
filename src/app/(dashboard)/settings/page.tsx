import { requireAuth } from '@/lib/auth/session';
import { requireWorkspace } from '@/lib/auth/workspace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { db, schema } from '@/lib/db';
import { users, workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserUsage, AI_LIMITS } from '@/lib/ai/limits';
import { AISettings } from '@/components/settings/ai-settings';
import { BillingActions } from '@/components/settings/billing-actions';
import { TeamSettings } from '@/components/settings/team-settings';
import { PLANS, type PlanId } from '@/lib/stripe/plans';

export default async function SettingsPage() {
  const user = await requireAuth();

  const fullUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      userAnthropicKey: true,
      userOpenaiKey: true
    }
  });

  const workspace = await requireWorkspace();
  const [ws] = await db
    .select({ plan: schema.workspaces.plan, stripeSubscriptionId: schema.workspaces.stripeSubscriptionId })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.workspaceId));
  const currentPlan = PLANS[(ws?.plan as PlanId) ?? 'free'] ?? PLANS.free;

  // Fetch workspace members for Team tab
  const members = await db
    .select({
      userId: schema.workspaceMembers.userId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, workspace.workspaceId));

  const canInvite = ['owner', 'admin'].includes(workspace.role);

  const usage = await getUserUsage(user.id);
  const usageInfo = {
    freeUsed: usage.totalEmailsProcessed,
    freeLimit: AI_LIMITS.FREE_TIER_EMAILS_PER_USER,
    isLimitReached: usage.totalEmailsProcessed >= AI_LIMITS.FREE_TIER_EMAILS_PER_USER
  };

  return (
    <div className="p-6 max-w-4xl mx-auto h-full overflow-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
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

        <TabsContent value="team">
          <TeamSettings members={members} canInvite={canInvite} />
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Billing & Plan</CardTitle>
                  <CardDescription>Manage your subscription</CardDescription>
                </div>
                <Badge variant={currentPlan.id === 'free' ? 'secondary' : 'default'} className="text-sm">
                  {currentPlan.name}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">{currentPlan.priceLabel}{currentPlan.price > 0 ? '/month' : ''}</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {currentPlan.features.map((f) => (
                    <li key={f}>- {f}</li>
                  ))}
                </ul>
              </div>
              <BillingActions
                currentPlan={currentPlan.id}
                hasSubscription={!!ws?.stripeSubscriptionId}
              />
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

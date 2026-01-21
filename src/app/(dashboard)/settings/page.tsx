import { requireAuth } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserUsage, AI_LIMITS } from '@/lib/ai/limits';
import { AISettings } from '@/components/settings/ai-settings';

export default async function SettingsPage() {
  const user = await requireAuth();

  const fullUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      userAnthropicKey: true,
      userOpenaiKey: true
    }
  });

  const usage = await getUserUsage(user.id);
  const usageInfo = {
    freeUsed: usage.totalEmailsProcessed,
    freeLimit: AI_LIMITS.FREE_TIER_EMAILS_PER_USER,
    isLimitReached: usage.totalEmailsProcessed >= AI_LIMITS.FREE_TIER_EMAILS_PER_USER
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
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

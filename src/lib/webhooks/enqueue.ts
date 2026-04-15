import { db, schema } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function recordWebhookEvent(opts: {
  provider: (typeof schema.channelProvider)['enumValues'][number];
  externalEventId: string;
  signatureOk: boolean;
  workspaceId?: string | null;
  payload: unknown;
}): Promise<{ eventId: string; duplicate: boolean }> {
  const [row] = await db
    .insert(schema.webhookEvents)
    .values({
      provider: opts.provider,
      externalEventId: opts.externalEventId,
      signatureOk: opts.signatureOk,
      workspaceId: opts.workspaceId ?? null,
      payload: opts.payload as any,
    })
    .onConflictDoNothing({
      target: [schema.webhookEvents.provider, schema.webhookEvents.externalEventId],
    })
    .returning({ id: schema.webhookEvents.id });

  if (row?.id) return { eventId: row.id, duplicate: false };

  const [existing] = await db
    .select({ id: schema.webhookEvents.id })
    .from(schema.webhookEvents)
    .where(
      sql`${schema.webhookEvents.provider} = ${opts.provider} AND ${schema.webhookEvents.externalEventId} = ${opts.externalEventId}`
    )
    .limit(1);
  return { eventId: existing!.id, duplicate: true };
}

export async function enqueueNormalizeInbound(eventId: string, workspaceId?: string | null) {
  await db.insert(schema.jobs).values({
    type: 'normalize-inbound',
    workspaceId: workspaceId ?? null,
    data: { webhookEventId: eventId } as any,
    priority: 10,
  });
}


import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto/encryption';

export async function POST(req: Request) {
    const session = await getSession();
    if (!session?.user) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const { anthropicKey, openaiKey } = await req.json();

        const updates: any = {};

        // Encrypt and store keys if provided
        if (anthropicKey !== undefined) {
            // Allow clearing key by passing empty string
            updates.userAnthropicKey = anthropicKey ? encrypt(anthropicKey) : null;
        }

        if (openaiKey !== undefined) {
            updates.userOpenaiKey = openaiKey ? encrypt(openaiKey) : null;
        }

        // Enable AI if any key is present (either new update or existing)
        // Actually, simple logic: if we are saving a key, enable AI.
        if (anthropicKey || openaiKey) {
            updates.aiEnabled = true;
        }

        await db.update(users)
            .set(updates)
            .where(eq(users.id, session.user.id));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update API keys:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

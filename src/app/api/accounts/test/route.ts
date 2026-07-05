import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';

const testSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecure: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let data: z.infer<typeof testSchema>;
  try {
    const body = await request.json();
    data = testSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const secure = data.imapSecure ?? (data.imapPort === 993);
  const startedAt = Date.now();
  const client = new ImapFlow({
    host: data.imapHost,
    port: data.imapPort,
    secure,
    auth: { user: data.email, pass: data.password },
    logger: false,
    tls: { rejectUnauthorized: process.env.IMAP_TLS_REJECT_UNAUTHORIZED !== 'false' },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
  });

  try {
    await client.connect();
    const latencyMs = Date.now() - startedAt;
    await client.logout();
    return NextResponse.json({
      success: true,
      latencyMs,
      message: 'Connection successful! Your credentials are valid.',
    });
  } catch (err: unknown) {
    const latencyMs = Date.now() - startedAt;
    const rawMsg = err instanceof Error ? err.message : String(err);

    // Map common IMAP errors to user-friendly messages
    let userMessage = 'Connection failed. Please check your settings.';
    let hint = '';

    if (rawMsg.includes('auth') || rawMsg.includes('credential') || rawMsg.includes('LOGIN') || rawMsg.includes('password') || rawMsg.includes('535') || rawMsg.includes('534')) {
      userMessage = 'Authentication failed — wrong password or app password required.';
      hint = 'app_password';
    } else if (rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND') || rawMsg.includes('ETIMEDOUT') || rawMsg.includes('connect')) {
      userMessage = 'Could not reach the mail server. Check the host and port.';
      hint = 'connection';
    } else if (rawMsg.includes('certificate') || rawMsg.includes('TLS') || rawMsg.includes('SSL')) {
      userMessage = 'SSL/TLS error. Try switching secure mode.';
      hint = 'ssl';
    }

    return NextResponse.json({
      success: false,
      latencyMs,
      message: userMessage,
      hint,
      raw: rawMsg,
    }, { status: 400 });
  }
}

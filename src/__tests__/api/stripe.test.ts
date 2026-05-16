/**
 * @jest-environment node
 */

// ── Auth mocks ──────────────────────────────────────────────────────────────
const mockSession = { user: { id: 'user-uuid', email: 'james@test.com' } };
const mockWorkspace = { workspaceId: 'ws-uuid', userId: 'user-uuid' };

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn().mockResolvedValue(mockSession),
}));
jest.mock('@/lib/auth/workspace', () => ({
  requireWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
}));

// ── DB mock ─────────────────────────────────────────────────────────────────
const mockWorkspaceRow = { stripeCustomerId: null as string | null };
const updatedWorkspaceRows: Record<string, unknown>[] = [];

jest.mock('@/lib/db', () => {
  const schema = {
    workspaces: { id: 'id', plan: 'plan', stripeCustomerId: 'stripe_customer_id' },
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([mockWorkspaceRow]),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          updatedWorkspaceRows.push(vals);
          return Promise.resolve();
        },
      }),
    }),
  };
  return { db, schema };
});

jest.mock('drizzle-orm', () => ({
  eq: () => ({}),
}));

// ── Stripe mock ──────────────────────────────────────────────────────────────
const mockCheckoutCreate = jest.fn();
const mockPortalCreate = jest.fn();
const mockSubscriptionRetrieve = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
    subscriptions: { retrieve: mockSubscriptionRetrieve },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

// ── next/headers mock — closure variable so tests can flip the sig value ───
const nextHeadersState = { sig: 'test-sig' as string | null };

jest.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => (key === 'stripe-signature' ? nextHeadersState.sig : null),
  }),
}));

// ── Env setup ────────────────────────────────────────────────────────────────
beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_PRO_PRICE_ID = 'price_pro_test';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.NEXTAUTH_URL = 'https://inboxgpt.fly.dev';
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkspaceRow.stripeCustomerId = null;
  updatedWorkspaceRows.length = 0;
  nextHeadersState.sig = 'test-sig';
  // Restore auth mocks to default after any once-overrides
  const { getSession } = jest.requireMock('@/lib/auth/session');
  (getSession as jest.Mock).mockResolvedValue(mockSession);
  const { requireWorkspace } = jest.requireMock('@/lib/auth/workspace');
  (requireWorkspace as jest.Mock).mockResolvedValue(mockWorkspace);
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/checkout
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/stripe/checkout', () => {
  it('returns checkout URL for a pro upgrade (new customer)', async () => {
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_abc');
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_pro_test', quantity: 1 }],
        customer_email: 'james@test.com',
        metadata: { workspaceId: 'ws-uuid' },
      })
    );
  });

  it('reuses existing Stripe customer ID when present', async () => {
    mockWorkspaceRow.stripeCustomerId = 'cus_existing_abc';
    mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_xyz' });

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://checkout.stripe.com/session_xyz');
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing_abc' })
    );
  });

  it('returns 401 when not authenticated', async () => {
    const { getSession } = jest.requireMock('@/lib/auth/session');
    (getSession as jest.Mock).mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid plan', async () => {
    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'invalid-plan' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 501 when STRIPE_PRO_PRICE_ID is not configured', async () => {
    const original = process.env.STRIPE_PRO_PRICE_ID;
    delete process.env.STRIPE_PRO_PRICE_ID;

    const { POST } = await import('@/app/api/stripe/checkout/route');
    const req = new Request('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(501);

    process.env.STRIPE_PRO_PRICE_ID = original;
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/portal
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/stripe/portal', () => {
  it('returns billing portal URL for a workspace with a customer', async () => {
    mockWorkspaceRow.stripeCustomerId = 'cus_portal_abc';
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_portal' });

    const { POST } = await import('@/app/api/stripe/portal/route');
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://billing.stripe.com/session_portal');
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_portal_abc',
      return_url: 'https://inboxgpt.fly.dev/settings',
    });
  });

  it('returns 400 when workspace has no Stripe customer', async () => {
    mockWorkspaceRow.stripeCustomerId = null;

    const { POST } = await import('@/app/api/stripe/portal/route');
    const res = await POST();
    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const { getSession } = jest.requireMock('@/lib/auth/session');
    (getSession as jest.Mock).mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/stripe/portal/route');
    const res = await POST();
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/webhooks — handleStripeWebhook
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/stripe/webhooks', () => {
  it('rejects requests with missing stripe-signature', async () => {
    nextHeadersState.sig = null; // flip to no signature

    const { POST } = await import('@/app/api/stripe/webhooks/route');
    const req = new Request('http://localhost/api/stripe/webhooks', {
      method: 'POST',
      body: 'raw-body',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('rejects requests with invalid signature', async () => {
    mockWebhooksConstructEvent.mockImplementationOnce(() => {
      throw new Error('Webhook signature verification failed');
    });

    const { POST } = await import('@/app/api/stripe/webhooks/route');
    const req = new Request('http://localhost/api/stripe/webhooks', {
      method: 'POST',
      body: 'bad-body',
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('handles checkout.session.completed — upgrades workspace plan', async () => {
    const fakeEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { workspaceId: 'ws-uuid' },
          subscription: 'sub_test_123',
          customer: 'cus_test_abc',
        },
      },
    };
    mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);
    mockSubscriptionRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { id: 'price_pro_test' } }] },
    });

    const { POST } = await import('@/app/api/stripe/webhooks/route');
    const req = new Request('http://localhost/api/stripe/webhooks', {
      method: 'POST',
      body: JSON.stringify(fakeEvent),
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(updatedWorkspaceRows.length).toBeGreaterThan(0);
    expect(updatedWorkspaceRows[0]).toMatchObject({
      plan: 'pro',
      stripeCustomerId: 'cus_test_abc',
      stripeSubscriptionId: 'sub_test_123',
    });
  });

  it('handles customer.subscription.deleted — downgrades workspace to free', async () => {
    const fakeEvent = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          metadata: { workspaceId: 'ws-uuid' },
          items: { data: [{ price: { id: 'price_pro_test' } }] },
        },
      },
    };
    mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

    const { POST } = await import('@/app/api/stripe/webhooks/route');
    const req = new Request('http://localhost/api/stripe/webhooks', {
      method: 'POST',
      body: JSON.stringify(fakeEvent),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(updatedWorkspaceRows[0]).toMatchObject({
      plan: 'free',
      stripeSubscriptionId: null,
    });
  });

  it('handles customer.subscription.updated — updates plan to pro', async () => {
    const fakeEvent = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          metadata: { workspaceId: 'ws-uuid' },
          items: { data: [{ price: { id: 'price_pro_test' } }] },
        },
      },
    };
    mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

    const { POST } = await import('@/app/api/stripe/webhooks/route');
    const req = new Request('http://localhost/api/stripe/webhooks', {
      method: 'POST',
      body: JSON.stringify(fakeEvent),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(updatedWorkspaceRows[0]).toMatchObject({ plan: 'pro' });
  });

  it('returns 200 even for unknown event types (no retries)', async () => {
    const fakeEvent = { type: 'some.unknown.event', data: { object: {} } };
    mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

    const { POST } = await import('@/app/api/stripe/webhooks/route');
    const req = new Request('http://localhost/api/stripe/webhooks', {
      method: 'POST',
      body: JSON.stringify(fakeEvent),
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
  });
});

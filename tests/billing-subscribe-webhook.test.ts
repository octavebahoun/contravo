import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db/drizzle';
import { organizations, users, memberships, subscriptions, subscriptionCycles, subscriptionPaymentAttempts } from '../lib/db/schema';
import { createSubscriptionCheckout, processExcellenceWebhook } from '../lib/billing/saas-billing.service';
import { eq } from 'drizzle-orm';

describe('SaaS Subscription & Webhook Pipeline (MVP6 Step 2)', () => {
  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `sub-user-${Math.random().toString(36).substring(2, 8)}@example.com`,
        fullName: 'Sub Test User',
        passwordHash: 'hashed_pw',
      })
      .returning();
    testUserId = user.id;

    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Sub Test Org',
        slug: `sub-org-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    testOrgId = org.id;

    await db.insert(memberships).values({
      organizationId: testOrgId,
      userId: testUserId,
      role: 'owner',
    });
  });

  afterAll(async () => {
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should create subscription checkout and cycle rows for Pro plan', async () => {
    const result = await createSubscriptionCheckout(testOrgId, testUserId, 'pro');

    expect(result).toBeDefined();
    expect(result.checkoutUrl).toBeDefined();
    expect(result.cycleId).toBeDefined();
    expect(result.attemptId).toBeDefined();
    expect(result.amountCents).toBe(1500000); // 15 000 XOF in cents
  });

  it('should activate subscription on payment.success webhook event', async () => {
    const checkoutResult = await createSubscriptionCheckout(testOrgId, testUserId, 'pro');

    const webhookPayload = {
      event: 'payment.success',
      data: {
        reference: `MTX-${Math.random().toString(36).substring(2, 8)}`,
        metadata: {
          kind: 'saas_subscription',
          org_id: testOrgId,
          cycle_id: checkoutResult.cycleId,
          attempt_id: checkoutResult.attemptId,
          plan_id: 'pro',
        },
      },
    };

    const response = await processExcellenceWebhook(
      { 'content-type': 'application/json' },
      JSON.stringify(webhookPayload)
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify DB states
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, testOrgId));
    expect(sub.planId).toBe('pro');
    expect(sub.status).toBe('active');

    const [cycle] = await db.select().from(subscriptionCycles).where(eq(subscriptionCycles.id, checkoutResult.cycleId));
    expect(cycle.status).toBe('paid');
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db/drizzle';
import { organizations, memberships, users, quotaUsage } from '../lib/db/schema';
import { PLANS } from '../lib/billing/plans';
import {
  getSubscription,
  getQuotaUsage,
  recomputeQuotaUsage,
  assertQuota,
  incrementPeriodUsage,
  QuotaExceededError,
} from '../lib/billing/quotas.service';
import { eq } from 'drizzle-orm';

describe('Billing & Quota Management Test Suite (MVP6 Step 1)', () => {
  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `quota-user-${Math.random().toString(36).substring(2, 8)}@example.com`,
        fullName: 'Quota Test User',
        passwordHash: 'hashed_pw',
      })
      .returning();
    testUserId = user.id;

    // Create test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Quota Test Org',
        slug: `quota-org-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    testOrgId = org.id;
  });

  afterAll(async () => {
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it('should define valid plan structures for Free, Pro, and Business', () => {
    expect(PLANS.free.quotas.maxMembers).toBe(3);
    expect(PLANS.pro.quotas.maxMembers).toBe(15);
    expect(PLANS.business.quotas.maxMembers).toBeNull();
  });

  it('should auto-initialize a free subscription if missing', async () => {
    const sub = await getSubscription(testOrgId);
    expect(sub).toBeDefined();
    expect(sub.organizationId).toBe(testOrgId);
    expect(sub.planId).toBe('free');
    expect(sub.status).toBe('active');
  });

  it('should compute quota usage correctly and reflect added members', async () => {
    const usageInitial = await getQuotaUsage(testOrgId);
    expect(usageInitial.membersCount).toBe(0);

    // Add a membership
    await db.insert(memberships).values({
      organizationId: testOrgId,
      userId: testUserId,
      role: 'owner',
    });

    const usageAfterTrigger = await getQuotaUsage(testOrgId);
    expect(usageAfterTrigger.membersCount).toBe(1);

    // Manual recompute
    const usageRecomputed = await recomputeQuotaUsage(testOrgId);
    expect(usageRecomputed.membersCount).toBe(1);
  });

  it('should pass assertQuota when under limits', async () => {
    await expect(assertQuota(testOrgId, 'maxMembers')).resolves.not.toThrow();
  });

  it('should throw QuotaExceededError when quota limit is exceeded', async () => {
    // On free plan, maxMembers is 3. Since current count is 1, asking for 3 more (total 4) should throw.
    await expect(assertQuota(testOrgId, 'maxMembers', 3)).rejects.toThrow(QuotaExceededError);
  });

  it('should increment period API calls usage without error', async () => {
    await expect(incrementPeriodUsage(testOrgId, 'apiCalls', 5)).resolves.not.toThrow();
  });
});

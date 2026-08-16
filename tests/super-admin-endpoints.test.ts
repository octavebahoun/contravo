import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../lib/db/drizzle';
import { organizations, subscriptions, subscriptionCycles, users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

// Mock Upstash Redis to prevent error during testing
vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      constructor() {}
      pipeline() {
        return {
          incr: () => {},
          expire: () => {},
          exec: () => Promise.reject(new Error('Redis disabled for tests')),
        };
      }
    },
  };
});

// Mock next/headers
let mockHeaders = new Map<string, string>();

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => mockHeaders.get(key) || null,
  }),
}));

// Import endpoints
import { GET as getDashboard } from '../app/api/v1/admin/dashboard/route';
import { GET as getOrganizations } from '../app/api/v1/admin/organizations/route';
import { POST as updateQuota } from '../app/api/v1/admin/organizations/[id]/quota/route';
import { POST as toggleSuspension } from '../app/api/v1/admin/organizations/[id]/suspend/route';
import { GET as getFinance } from '../app/api/v1/admin/finance/route';

describe('Super-Admin Platform API Endpoints (MVP7)', () => {
  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    // 1. Create a test user
    const [user] = await db
      .insert(users)
      .values({
        email: `super-admin-test-${Math.random().toString(36).substring(2, 8)}@example.com`,
        fullName: 'Super Admin Test',
        passwordHash: 'hash',
      })
      .returning();
    testUserId = user.id;

    // 2. Create a test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'SuperAdmin Test Org',
        slug: `sa-test-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    testOrgId = org.id;

    // 3. Create a test subscription
    const [sub] = await db.insert(subscriptions).values({
      organizationId: testOrgId,
      planId: 'pro',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    }).returning();

    // 4. Create a test subscription cycle for finance logs
    await db.insert(subscriptionCycles).values({
      subscriptionId: sub.id,
      organizationId: testOrgId,
      cycleNumber: 1,
      planId: 'pro',
      amountCents: 15000n,
      currency: 'XOF',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'paid',
      invoiceNumber: 'INV-TEST-001',
      paidAt: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testOrgId) {
      await db.delete(subscriptionCycles).where(eq(subscriptionCycles.organizationId, testOrgId));
      await db.delete(subscriptions).where(eq(subscriptions.organizationId, testOrgId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  function makeRequest(url: string, method: string = 'GET', body: any = null) {
    const req = new Request(url, {
      method,
      headers: {
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
    }) as any;
    req.nextUrl = new URL(url);
    return req as NextRequest;
  }

  describe('Route Guards / requireSuperAdmin', () => {
    it('should deny GET access to dashboard if headers are not set', async () => {
      mockHeaders.clear();
      const req = makeRequest('https://app.test/api/v1/admin/dashboard');
      const res = await getDashboard(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('PERMISSION_DENIED');
    });

    it('should deny GET access to dashboard if user is not super admin', async () => {
      mockHeaders.clear();
      mockHeaders.set('x-user-id', testUserId);
      mockHeaders.set('x-is-super-admin', 'false');

      const req = makeRequest('https://app.test/api/v1/admin/dashboard');
      const res = await getDashboard(req);
      expect(res.status).toBe(403);
    });

    it('should allow GET access to dashboard if headers are correct', async () => {
      mockHeaders.clear();
      mockHeaders.set('x-user-id', testUserId);
      mockHeaders.set('x-is-super-admin', 'true');

      const req = makeRequest('https://app.test/api/v1/admin/dashboard');
      const res = await getDashboard(req);
      if (res.status !== 200) {
        console.error('Dashboard Error:', await res.json());
      }
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('mrr');
      expect(data).toHaveProperty('churnRate');
      expect(data.systemHealth.apiStatus).toBe('healthy');
    });
  });

  describe('GET /api/v1/admin/organizations', () => {
    it('should return the directory of organizations', async () => {
      mockHeaders.clear();
      mockHeaders.set('x-user-id', testUserId);
      mockHeaders.set('x-is-super-admin', 'true');

      const req = makeRequest('https://app.test/api/v1/admin/organizations');
      const res = await getOrganizations(req);
      if (res.status !== 200) {
        console.error('Orgs list Error:', await res.json());
      }
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.organizations).toBeDefined();
      expect(Array.isArray(data.organizations)).toBe(true);

      const targetOrg = data.organizations.find((o: any) => o.id === testOrgId);
      expect(targetOrg).toBeDefined();
      expect(targetOrg.name).toBe('SuperAdmin Test Org');
      expect(targetOrg.plan).toBe('pro');
    });
  });

  describe('POST /api/v1/admin/organizations/[id]/quota', () => {
    it('should update the custom quota overrides for the organization', async () => {
      mockHeaders.clear();
      mockHeaders.set('x-user-id', testUserId);
      mockHeaders.set('x-is-super-admin', 'true');

      const req = makeRequest(`https://app.test/api/v1/admin/organizations/${testOrgId}/quota`, 'POST', {
        customMaxMembers: 12,
        customMaxClients: 45,
        customMaxProjects: 99,
      });

      const res = await updateQuota(req, { params: Promise.resolve({ id: testOrgId }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.organization.customMaxMembers).toBe(12);
      expect(data.organization.customMaxClients).toBe(45);
      expect(data.organization.customMaxProjects).toBe(99);
    });
  });

  describe('POST /api/v1/admin/organizations/[id]/suspend', () => {
    it('should suspend and then reactivate the organization', async () => {
      mockHeaders.clear();
      mockHeaders.set('x-user-id', testUserId);
      mockHeaders.set('x-is-super-admin', 'true');

      // Suspend
      const reqSuspend = makeRequest(`https://app.test/api/v1/admin/organizations/${testOrgId}/suspend`, 'POST', {
        action: 'suspend',
      });
      const resSuspend = await toggleSuspension(reqSuspend, { params: Promise.resolve({ id: testOrgId }) });
      expect(resSuspend.status).toBe(200);
      const dataSuspend = await resSuspend.json();
      expect(dataSuspend.success).toBe(true);
      expect(dataSuspend.subscriptionStatus).toBe('suspended');

      // Reactivate
      const reqReactivate = makeRequest(`https://app.test/api/v1/admin/organizations/${testOrgId}/suspend`, 'POST', {
        action: 'reactivate',
      });
      const resReactivate = await toggleSuspension(reqReactivate, { params: Promise.resolve({ id: testOrgId }) });
      expect(resReactivate.status).toBe(200);
      const dataReactivate = await resReactivate.json();
      expect(dataReactivate.success).toBe(true);
      expect(dataReactivate.subscriptionStatus).toBe('active');
    });
  });

  describe('GET /api/v1/admin/finance', () => {
    it('should return financial history and aggregates', async () => {
      mockHeaders.clear();
      mockHeaders.set('x-user-id', testUserId);
      mockHeaders.set('x-is-super-admin', 'true');

      const req = makeRequest('https://app.test/api/v1/admin/finance');
      const res = await getFinance(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.transactions).toBeDefined();
      expect(data.aggregates).toBeDefined();
      expect(Number(data.aggregates.totalRevenueXof)).toBeGreaterThanOrEqual(150);
      expect(data.aggregates.paidCount).toBeGreaterThanOrEqual(1);
    });
  });
});

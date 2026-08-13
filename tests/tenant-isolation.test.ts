import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db/drizzle';
import { tenantDb } from '../lib/db/tenant-db';
import { organizations, auditLogs } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

describe('Tenant Isolation Test Suite', () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    // 1. Create Tenant A
    const [orgA] = await db
      .insert(organizations)
      .values({
        name: 'Tenant A Test Corp',
        slug: `tenant-a-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    tenantAId = orgA.id;

    // 2. Create Tenant B
    const [orgB] = await db
      .insert(organizations)
      .values({
        name: 'Tenant B Test Corp',
        slug: `tenant-b-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    tenantBId = orgB.id;
  });

  afterAll(async () => {
    // Clean up created organizations
    if (tenantAId) {
      await db.delete(organizations).where(eq(organizations.id, tenantAId));
    }
    if (tenantBId) {
      await db.delete(organizations).where(eq(organizations.id, tenantBId));
    }
  });

  it('should prevent cross-tenant data leakage', async () => {
    // 3. Insert record for Tenant A via tenantDb(tenantAId)
    const dbA = tenantDb(tenantAId);
    const dbB = tenantDb(tenantBId);

    await dbA.insert(auditLogs, {
      action: 'test.action.tenant.a',
      metadata: { key: 'secret_a' },
    });

    // 4. Try to read Tenant A's record using dbB (Tenant B's scope)
    const logsFromB = await dbB.select(auditLogs);
    
    // Check that Tenant B sees no records (as it should only see its own empty list)
    expect(logsFromB.length).toBe(0);

    // 5. Try to read Tenant A's record using dbA (Tenant A's scope)
    const logsFromA = await dbA.select(auditLogs);
    expect(logsFromA.length).toBe(1);
    expect(logsFromA[0].action).toBe('test.action.tenant.a');
    expect(logsFromA[0].organizationId).toBe(tenantAId);
  });
});

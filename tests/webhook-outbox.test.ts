import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db/drizzle';
import { organizations, webhookEndpoints, webhookDeliveries, clients } from '../lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { withOutbox } from '../lib/webhooks';

/**
 * The outbox invariant: an event commits with the write that produced it, or not
 * at all.
 *
 * `emit()` used to be called from inside `db.transaction()` while writing through
 * the *global* connection. The delivery row therefore landed outside the
 * transaction, and a business write that rolled back afterwards still left a
 * queued — and already dispatched — webhook for an entity that never existed.
 */
describe('Webhook outbox transactionality', () => {
  let orgId: string;
  let endpointId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Outbox Test Org', slug: `outbox-test-${Date.now()}` })
      .returning();
    orgId = org.id;

    // Deliberately unroutable: nothing must actually leave the machine, and the
    // test only ever inspects rows.
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values({
        organizationId: orgId,
        kind: 'generic',
        url: 'https://outbox-test.invalid/hook',
        secret: 'whsec_test_only',
        events: ['*'],
        active: true,
      })
      .returning();
    endpointId = endpoint.id;
  }, 60000);

  afterAll(async () => {
    await db.delete(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpointId));
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId));
    await db.delete(clients).where(eq(clients.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }, 60000);

  const countDeliveries = async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpointId));
    return row.n;
  };

  const countClients = async () => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.organizationId, orgId));
    return row.n;
  };

  it('rolls the event back with the write that raised it', async () => {
    const deliveriesBefore = await countDeliveries();
    const clientsBefore = await countClients();

    await expect(
      withOutbox(async (tx, outbox) => {
        const [client] = await tx
          .insert(clients)
          .values({
            organizationId: orgId,
            type: 'company',
            displayName: 'Rolled Back Client',
            email: `rollback-${Date.now()}@outbox.test`,
          })
          .returning();

        // The event is raised *before* the failure, which is exactly the case
        // the old code could not survive.
        await outbox.emit('client.created', orgId, { client });

        throw new Error('échec métier après émission');
      })
    ).rejects.toThrow('échec métier après émission');

    expect(await countClients()).toBe(clientsBefore);
    expect(await countDeliveries()).toBe(deliveriesBefore);
  }, 60000);

  it('commits the event with the write, and only queues it once', async () => {
    const before = await countDeliveries();

    const created = await withOutbox(async (tx, outbox) => {
      const [client] = await tx
        .insert(clients)
        .values({
          organizationId: orgId,
          type: 'company',
          displayName: 'Committed Client',
          email: `commit-${Date.now()}@outbox.test`,
        })
        .returning();

      await outbox.emit('client.created', orgId, { client });
      return client;
    });

    expect(created.id).toBeTruthy();
    expect(await countDeliveries()).toBe(before + 1);

    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(
        and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.event, 'client.created'))
      )
      .limit(1);

    expect(delivery).toBeDefined();
    const payload = delivery.payload as any;
    expect(payload.type).toBe('client.created');
    expect(payload.organizationId).toBe(orgId);
    expect(payload.data.client.displayName).toBe('Committed Client');
  }, 60000);

  it('makes the row visible to a reader before the event is dispatched', async () => {
    // What the ordering is actually for: a consumer told about an entity must be
    // able to read it. The delivery row committing implies the business row did
    // too, since both are written by the same transaction.
    const created = await withOutbox(async (tx, outbox) => {
      const [client] = await tx
        .insert(clients)
        .values({
          organizationId: orgId,
          type: 'company',
          displayName: 'Readable Client',
          email: `readable-${Date.now()}@outbox.test`,
        })
        .returning();

      await outbox.emit('client.created', orgId, { client });
      return client;
    });

    // Read through the global connection, the way a webhook consumer's callback
    // would come back in.
    const [visible] = await db.select().from(clients).where(eq(clients.id, created.id)).limit(1);
    expect(visible).toBeDefined();
    expect(visible.displayName).toBe('Readable Client');
  }, 60000);
});

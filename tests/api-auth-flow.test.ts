import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db/drizzle';
import { organizations, apiKeys, webhookEndpoints, webhookDeliveries } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateApiKey, verifyApiKey, rotateApiKey, revokeApiKey } from '../lib/api-keys';
import { generatePublicToken, verifyPublicToken, consumePublicToken, revokePublicToken } from '../lib/public-tokens';
import { rateLimit } from '../lib/rate-limit';
import { emit, signPayload } from '../lib/webhooks';

describe('Unified API Auth and Infrastructure Test Suite', () => {
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    // Create primary test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'API Auth Test Org',
        slug: `api-auth-org-${Math.random().toString(36).substring(2, 8)}`,
        plan: 'premium',
      })
      .returning();
    orgId = org.id;

    // Create a secondary organization to test tenant isolation
    const [otherOrg] = await db
      .insert(organizations)
      .values({
        name: 'Isolation Test Org',
        slug: `iso-org-${Math.random().toString(36).substring(2, 8)}`,
        plan: 'free',
      })
      .returning();
    otherOrgId = otherOrg.id;
  });

  afterAll(async () => {
    // Cleanup database records
    if (orgId) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    if (otherOrgId) {
      await db.delete(organizations).where(eq(organizations.id, otherOrgId));
    }
  });

  describe('1. API Key Lifecycle & Security', () => {
    it('should generate, verify, rotate, and revoke API keys with proper scope/tenant validation', async () => {
      // A. Generate Key
      const keyName = 'Test Production Key';
      const scopes = ['contracts:read', 'invoices:read'];
      const keyObj = await generateApiKey({
        organizationId: orgId,
        name: keyName,
        scopes,
      });

      expect(keyObj.secret).toContain('sk_live_');
      expect(keyObj.id).toBeDefined();

      // B. Verify Key
      const verified = await verifyApiKey(keyObj.secret, '127.0.0.1');
      expect(verified.organizationId).toBe(orgId);
      expect(verified.scopes).toContain('contracts:read');
      expect(verified.scopes).toContain('invoices:read');
      expect(verified.scopes).not.toContain('*');

      // C. Rotate Key
      const rotated = await rotateApiKey(keyObj.id, orgId);
      expect(rotated.id).not.toBe(keyObj.id);
      expect(rotated.secret).toContain('sk_live_');

      // Verify the new rotated key works immediately
      const verifiedRotated = await verifyApiKey(rotated.secret, '127.0.0.1');
      expect(verifiedRotated.organizationId).toBe(orgId);

      // Verify the old key is marked for rotation with an expiry
      const [oldKeyRecord] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, keyObj.id))
        .limit(1);
      expect(oldKeyRecord.expiresAt).not.toBeNull();
      
      // D. Revoke Key
      await revokeApiKey(rotated.id, orgId);
      await expect(verifyApiKey(rotated.secret, '127.0.0.1')).rejects.toThrow();
    });

    it('should prevent updating or rotating keys owned by another tenant', async () => {
      const keyObj = await generateApiKey({
        organizationId: orgId,
        name: 'Leak Test Key',
        scopes: ['*'],
      });

      // Attempt rotation using otherOrgId should fail
      await expect(rotateApiKey(keyObj.id, otherOrgId)).rejects.toThrow();

      // Attempt revocation using otherOrgId should fail
      await expect(revokeApiKey(keyObj.id, otherOrgId)).rejects.toThrow();
    });
  });

  describe('2. Public Tokens Lifecycle & Limitations', () => {
    it('should enforce resource scopes, limits, and expiration rules', async () => {
      const resourceId = 'd3b07384-d113-4956-a50e-a1c6a2e4e240';
      const recipient = 'recipient@test.com';

      // A. Generate Public Token
      const ptObj = await generatePublicToken({
        organizationId: orgId,
        resourceType: 'quote',
        resourceId,
        recipientEmail: recipient,
        actions: ['read', 'sign'],
        expiresInDays: 30,
        maxUses: 2,
      });

      expect(ptObj.token).toContain('pt_');

      // B. Verify Token
      const verifiedPt = await verifyPublicToken(ptObj.token, 'quote', resourceId);
      expect(verifiedPt.organizationId).toBe(orgId);
      expect(verifiedPt.recipientEmail).toBe(recipient);
      expect(verifiedPt.actions).toContain('read');
      expect(verifiedPt.actions).toContain('sign');

      // Verify cross-resource access is denied
      await expect(verifyPublicToken(ptObj.token, 'contract', resourceId)).rejects.toThrow();
      await expect(verifyPublicToken(ptObj.token, 'quote', 'e2a77cf2-7d2d-450f-90e9-b57ef490c29f')).rejects.toThrow();

      // C. Consume Token & Enforce max_uses
      await consumePublicToken(verifiedPt.id, '192.168.1.10'); // Use 1
      await consumePublicToken(verifiedPt.id, '192.168.1.11'); // Use 2

      // Third consume attempt must fail since maxUses is 2
      await expect(consumePublicToken(verifiedPt.id, '192.168.1.12')).rejects.toThrow();

      // D. Revocation
      const newPtObj = await generatePublicToken({
        organizationId: orgId,
        resourceType: 'quote',
        resourceId,
        recipientEmail: recipient,
        actions: ['read'],
        expiresInDays: 30,
      });
      const verifiedNewPt = await verifyPublicToken(newPtObj.token, 'quote', resourceId);
      
      await revokePublicToken(verifiedNewPt.id, orgId);
      await expect(verifyPublicToken(newPtObj.token, 'quote', resourceId)).rejects.toThrow();
    });
  });

  describe('3. Rate Limiting Capabilities', () => {
    it('should allow requests within rate limits and block once limit is exceeded', async () => {
      const limitKey = `rate-limit-test-${Date.now()}`;
      
      // Let's make 105 requests for the 'free' tier (limit: 100)
      const results: boolean[] = [];
      for (let i = 0; i < 105; i++) {
        const res = await rateLimit(limitKey, 'free');
        results.push(res.allowed);
      }

      // First 100 requests should be allowed
      for (let i = 0; i < 100; i++) {
        expect(results[i]).toBe(true);
      }
      // Requests 101-105 should be blocked
      for (let i = 100; i < 105; i++) {
        expect(results[i]).toBe(false);
      }
    });
  });

  describe('4. Webhook Dispatch and HMAC Signatures', () => {
    it('should sign payloads correctly and log attempts', async () => {
      const webhookUrl = 'https://webhook.site/test-receiver';
      const secret = 'whsec_TestSigningSecret123!';

      // Create Webhook Endpoint configuration
      const [endpoint] = await db
        .insert(webhookEndpoints)
        .values({
          organizationId: orgId,
          url: webhookUrl,
          secret,
          events: ['quote.signed', 'deliverable.approved'],
        })
        .returning();

      // Test signature correctness
      const payloadObj = { event: 'quote.signed', data: { id: 'qte_123' } };
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signPayload(JSON.stringify(payloadObj), secret, timestamp);
      expect(signature).toBeDefined();
      expect(signature).toContain(`t=${timestamp}`);
      expect(signature).toContain('v1=');

      // Dispatch event via emit (will dispatch asynchronously to the mock/real URL in the background)
      const eventName = 'quote.signed';
      await emit(eventName, orgId, payloadObj.data);

      // Verify that at least a delivery record was registered in the database for the event dispatch
      const deliveries = await db
        .select({
          id: webhookDeliveries.id,
          endpointId: webhookDeliveries.endpointId,
          event: webhookDeliveries.event,
        })
        .from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
        .where(eq(webhookEndpoints.organizationId, orgId));

      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      const delivery = deliveries[0];
      expect(delivery.endpointId).toBe(endpoint.id);
      expect(delivery.event).toBe(eventName);

      // Cleanup endpoint
      await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id));
    });
  });
});

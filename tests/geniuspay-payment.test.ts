import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../lib/db/drizzle';
import {
  organizations,
  clients,
  invoices,
  paymentGatewayCredentials,
  paymentIntents,
  paymentWebhookEvents,
  invoicePayments,
} from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { encryptSecret } from '../lib/payments/credentials.service';
import { createPaymentIntent, processGeniusPayWebhook } from '../lib/payments/geniuspay/payment-intents.service';
import { GeniusPayClient } from '../lib/payments/geniuspay/geniuspay-client';
import crypto from 'crypto';

describe('GeniusPay Payment Integration and Webhook Pipeline Suite', () => {
  let orgId: string;
  let clientId: string;
  let invoiceId: string;
  let credentialsId: string;
  const webhookSecret = 'test_webhook_secret_key_123456789';
  const apiSecret = 'test_api_secret_key_123456789012';

  beforeAll(async () => {
    // 1. Create Organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'GeniusPay Test Org',
        slug: `geniuspay-org-${Math.random().toString(36).substring(2, 8)}`,
      })
      .returning();
    orgId = org.id;

    // 2. Create Client
    const [client] = await db
      .insert(clients)
      .values({
        organizationId: orgId,
        type: 'company',
        displayName: 'Test Client Ltd',
        email: 'billing@testclient.com',
      })
      .returning();
    clientId = client.id;

    // 3. Create Invoice
    const [invoice] = await db
      .insert(invoices)
      .values({
        organizationId: orgId,
        clientId,
        number: `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        status: 'sent',
        currency: 'XOF',
        subtotalCents: 50000n,
        taxCents: 0n,
        totalCents: 50000n,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
      })
      .returning();
    invoiceId = invoice.id;

    // 4. Encrypt and Insert active GeniusPay Gateway credentials
    const encryptedApi = encryptSecret(apiSecret);
    const encryptedWebhook = encryptSecret(webhookSecret);

    const [creds] = await db
      .insert(paymentGatewayCredentials)
      .values({
        organizationId: orgId,
        provider: 'geniuspay',
        environment: 'sandbox',
        apiKeyPublic: 'gpay_pub_test_123',
        apiSecretEncrypted: encryptedApi.encrypted,
        apiSecretNonce: encryptedApi.nonce,
        webhookSecretEncrypted: encryptedWebhook.encrypted,
        webhookSecretNonce: encryptedWebhook.nonce,
        status: 'active',
      })
      .returning();
    credentialsId = creds.id;
  }, 60000);

  afterAll(async () => {
    // Cleanup in reverse order
    await db.delete(paymentWebhookEvents).where(eq(paymentWebhookEvents.organizationId, orgId));
    await db.delete(invoicePayments).where(eq(invoicePayments.organizationId, orgId));
    await db.delete(paymentIntents).where(eq(paymentIntents.organizationId, orgId));
    await db.delete(paymentGatewayCredentials).where(eq(paymentGatewayCredentials.id, credentialsId));
    await db.delete(invoices).where(eq(invoices.id, invoiceId));
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }, 60000);

  describe('1. Payment Intent Creation', () => {
    it('should successfully create local and remote payment intent', async () => {
      const mockCheckoutUrl = 'https://geniuspay.ci/checkout/pay_12345';
      const mockRef = 'ref_gpay_98765';

      const initiateSpy = vi.spyOn(GeniusPayClient.prototype, 'initiatePayment').mockResolvedValue({
        success: true,
        data: {
          id: 12345,
          reference: mockRef,
          amount: 50000,
          currency: 'XOF',
          status: 'pending',
          checkout_url: mockCheckoutUrl,
          environment: 'sandbox',
        },
      });

      const intent = await createPaymentIntent({
        organizationId: orgId,
        invoiceId,
        initiatedFromIp: '127.0.0.1',
      });

      // XOF has no minor unit: a 50 000 XOF invoice must be sent as 50000, not
      // 500. The service used to divide by 100 and undercharge a hundredfold.
      expect(initiateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 50000, currency: 'XOF' })
      );
      expect(intent).toBeDefined();
      expect(intent.status).toBe('pending');
      expect(intent.gatewayReference).toBe(mockRef);
      expect(intent.checkoutUrl).toBe(mockCheckoutUrl);
      expect(intent.amountCents).toBe(50000n);

      initiateSpy.mockRestore();
    });
  });

  describe('2. Webhook Signature Validation', () => {
    it('should correctly verify valid signatures and reject invalid ones', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({ event: 'payment.success', id: 'evt_123' });
      const dataToSign = timestamp + '.' + payload;
      const validSignature = crypto.createHmac('sha256', webhookSecret).update(dataToSign).digest('hex');

      const isSigValid = GeniusPayClient.verifyWebhookSignature(validSignature, timestamp, payload, webhookSecret);
      expect(isSigValid).toBe(true);

      const isSigInvalid = GeniusPayClient.verifyWebhookSignature('wrong_sig', timestamp, payload, webhookSecret);
      expect(isSigInvalid).toBe(false);
    });
  });

  describe('3. 9-Step Webhook Processing Pipeline', () => {
    it('should process payment.success webhook, update database, and handle duplicates (idempotency)', async () => {
      const mockRef = `ref_${Math.random().toString(36).substring(2, 10)}`;
      
      // First, create a pending payment intent in DB to link with
      const [intent] = await db
        .insert(paymentIntents)
        .values({
          organizationId: orgId,
          invoiceId,
          provider: 'geniuspay',
          environment: 'sandbox',
          amountCents: 50000n,
          currency: 'XOF',
          status: 'pending',
          gatewayReference: mockRef,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        })
        .returning();

      // Webhook payload mimicking GeniusPay structure
      const eventId = `evt_${Math.random().toString(36).substring(2, 10)}`;
      const payloadObj = {
        id: eventId,
        event: 'payment.success',
        environment: 'sandbox',
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          reference: mockRef,
          amount: 50000,
          currency: 'XOF',
          fees: 1000,
          net_amount: 49000,
          status: 'completed',
          payment_method: 'orange_money',
          completed_at: new Date().toISOString(),
          metadata: {
            organization_id: orgId,
            invoice_id: invoiceId,
          },
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const timestampStr = payloadObj.timestamp.toString();
      const dataToSign = timestampStr + '.' + rawBody;
      const signature = crypto.createHmac('sha256', webhookSecret).update(dataToSign).digest('hex');

      const headers = {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestampStr,
        'x-webhook-event': 'payment.success',
        'x-webhook-environment': 'sandbox',
      };

      // Mock GeniusPayClient getPayment to prevent actual API calls (Step 7: Re-fetch)
      const getPaymentSpy = vi.spyOn(GeniusPayClient.prototype, 'getPayment').mockResolvedValue({
        success: true,
        data: {
          id: 999,
          reference: mockRef,
          amount: 50000,
          currency: 'XOF',
          fees: 1000,
          net_amount: 49000,
          status: 'completed',
          payment_method: 'orange_money',
          completed_at: payloadObj.data.completed_at,
          environment: 'sandbox',
        },
      });

      // 1. Process standard webhook success flow
      const response = await processGeniusPayWebhook(headers, rawBody, '127.0.0.1');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify payment intent updated
      const [updatedIntent] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, intent.id));
      expect(updatedIntent.status).toBe('succeeded');
      expect(updatedIntent.gatewayFeesCents).toBe(1000n);
      expect(updatedIntent.gatewayNetCents).toBe(49000n);

      // Verify invoice updated to paid or partial (amountPaidCents = 50000n)
      const [updatedInvoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId));
      expect(updatedInvoice.status).toBe('paid');
      expect(updatedInvoice.amountPaidCents).toBe(50000n);

      // Verify payment recorded in invoicePayments
      const [paymentRecord] = await db
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.paymentIntentId, intent.id));
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord.amountCents).toBe(50000n);
      expect(paymentRecord.gatewayReference).toBe(mockRef);

      // Verify webhook event log
      const [eventLog] = await db
        .select()
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, eventId));
      expect(eventLog.signatureValid).toBe(true);
      expect(eventLog.processedAt).not.toBeNull();
      expect(eventLog.processingError).toBeNull();

      // 2. Test Idempotency (replay attack / duplicate event handling)
      const duplicateResponse = await processGeniusPayWebhook(headers, rawBody, '127.0.0.1');
      expect(duplicateResponse.status).toBe(200);
      expect(duplicateResponse.body.message).toContain('Duplicate event');

      getPaymentSpy.mockRestore();
    });

    it('should reject webhook if timestamp is too old (replay protection)', async () => {
      const eventId = `evt_expired_${Math.random().toString(36).substring(2, 10)}`;
      const payloadObj = {
        id: eventId,
        event: 'payment.success',
        timestamp: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago (> 300s)
        data: {},
      };

      const rawBody = JSON.stringify(payloadObj);
      const headers = {
        'content-type': 'application/json',
        'x-webhook-signature': 'any_signature',
        'x-webhook-timestamp': payloadObj.timestamp.toString(),
        'x-webhook-event': 'payment.success',
      };

      const response = await processGeniusPayWebhook(headers, rawBody, '127.0.0.1');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Timestamp expired');
    });

    it('should detect amount mismatches and abort processing (tampering/spoofing protection)', async () => {
      const mockRef = `ref_mismatch_${Math.random().toString(36).substring(2, 10)}`;

      // Create a local intent
      const [intent] = await db
        .insert(paymentIntents)
        .values({
          organizationId: orgId,
          invoiceId,
          provider: 'geniuspay',
          environment: 'sandbox',
          amountCents: 50000n, // 50 000 XOF
          currency: 'XOF',
          status: 'pending',
          gatewayReference: mockRef,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        })
        .returning();

      // Payload claiming 50 000 XOF was paid
      const eventId = `evt_mismatch_${Math.random().toString(36).substring(2, 10)}`;
      const payloadObj = {
        id: eventId,
        event: 'payment.success',
        environment: 'sandbox',
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          reference: mockRef,
          amount: 50000, // Payload claims 50 000 XOF
          currency: 'XOF',
          metadata: {
            organization_id: orgId,
            invoice_id: invoiceId,
          },
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const timestampStr = payloadObj.timestamp.toString();
      const dataToSign = timestampStr + '.' + rawBody;
      const signature = crypto.createHmac('sha256', webhookSecret).update(dataToSign).digest('hex');

      const headers = {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestampStr,
        'x-webhook-event': 'payment.success',
        'x-webhook-environment': 'sandbox',
      };

      // Mock remote response to return 500 XOF (e.g. attacker tampered with webhook payload)
      const getPaymentSpy = vi.spyOn(GeniusPayClient.prototype, 'getPayment').mockResolvedValue({
        success: true,
        data: {
          id: 1001,
          reference: mockRef,
          amount: 500, // REAL transaction amount is only 500 XOF!
          currency: 'XOF',
          status: 'completed',
          environment: 'sandbox',
        },
      });

      const response = await processGeniusPayWebhook(headers, rawBody, '127.0.0.1');
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Amount mismatch detected');

      // Verify the local payment intent was NOT marked as succeeded
      const [failedIntent] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, intent.id));
      expect(failedIntent.status).toBe('pending'); // Left as pending

      // Verify the event log recorded amount_mismatch error
      const [eventLog] = await db
        .select()
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.eventId, eventId));
      expect(eventLog.processingError).toBe('amount_mismatch');

      getPaymentSpy.mockRestore();
    });
  });
});

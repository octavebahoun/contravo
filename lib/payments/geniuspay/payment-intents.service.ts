import { db } from '../../db/drizzle';
import { paymentIntents, paymentWebhookEvents, paymentGatewayCredentials, invoices, clients, invoicePayments } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { decryptSecret, decryptSecretWithKek } from '../credentials.service';
import { recordPayment as recordInvoicePayment } from '../../repositories/invoices.repo';
import { GeniusPayClient } from './geniuspay-client';
import { emit } from '../../webhooks';
import { buildEventPayload } from '../../webhooks/payload-builder';
import { getAppUrl } from '@/lib/config/app-url';
import { fromGatewayAmount, toGatewayAmount } from '@/lib/money';
import { ApiError } from '@/lib/rbac';




export interface CreatePaymentIntentInput {
  organizationId: string;
  invoiceId: string;
  initiatedFromIp?: string | null;
}

/**
 * Creates a Payment Intent locally, calls GeniusPay API to initiate payment, and updates the local intent record
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
  customKek?: string
): Promise<any> {
  const { organizationId, invoiceId, initiatedFromIp } = input;

  // 1. Get the invoice and linked client
  const [invoiceRecord] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId), sql`deleted_at IS NULL`));

  if (!invoiceRecord) {
    throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
  }

  // Only what is still owed may be collected. A closed invoice must not be
  // payable at all, and a partially paid one must be charged its balance —
  // charging `totalCents` again would take money already received.
  if (!['sent', 'partial', 'overdue'].includes(invoiceRecord.status)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Cette facture n’est pas payable (statut '${invoiceRecord.status}').`,
      400
    );
  }

  const amountDueCents = BigInt(invoiceRecord.amountDueCents ?? 0n);
  if (amountDueCents <= 0n) {
    throw new ApiError('VALIDATION_ERROR', 'Cette facture est déjà soldée.', 400);
  }

  const [clientRecord] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoiceRecord.clientId), eq(clients.organizationId, organizationId)));

  if (!clientRecord) {
    throw new ApiError('NOT_FOUND', 'Client not found for the invoice', 404);
  }

  // 2. Fetch active payment gateway credentials for GeniusPay
  const [credentials] = await db
    .select()
    .from(paymentGatewayCredentials)
    .where(
      and(
        eq(paymentGatewayCredentials.organizationId, organizationId),
        eq(paymentGatewayCredentials.provider, 'geniuspay'),
        eq(paymentGatewayCredentials.status, 'active')
      )
    );

  if (!credentials) {
    // The organization never connected its gateway. The portal must say so
    // plainly and fall back to the bank details, not answer 500.
    throw new ApiError(
      'PAYMENT_NOT_CONFIGURED',
      'Le paiement en ligne n’est pas activé pour cette organisation.',
      409
    );
  }

  // 3. Decrypt the API Secret
  const apiSecret = customKek
    ? decryptSecretWithKek(credentials.apiSecretEncrypted, credentials.apiSecretNonce, customKek)
    : decryptSecret(credentials.apiSecretEncrypted, credentials.apiSecretNonce);

  // 4. Initialize GeniusPay Client
  const client = new GeniusPayClient(
    credentials.apiKeyPublic,
    apiSecret,
    credentials.environment as 'sandbox' | 'live'
  );

  // 5. Create local Payment Intent
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h expiration
  const [localIntent] = await db
    .insert(paymentIntents)
    .values({
      organizationId,
      invoiceId,
      provider: 'geniuspay',
      environment: credentials.environment,
      amountCents: amountDueCents,
      currency: invoiceRecord.currency,
      status: 'created',
      initiatedFromIp: initiatedFromIp || null,
      expiresAt,
    })
    .returning();

  // 6. Call GeniusPay to initiate checkout
  try {
    const response = await client.initiatePayment({
      // GeniusPay takes the amount in the currency's normal unit — its own
      // examples post `{"amount": 5000}` for 5 000 XOF. Dividing by 100 here
      // undercharged every XOF invoice by a factor of 100.
      amount: toGatewayAmount(amountDueCents, invoiceRecord.currency),
      currency: invoiceRecord.currency,
      description: `Paiement Facture ${invoiceRecord.number}`,
      customer: {
        name: clientRecord.displayName,
        email: clientRecord.email,
        phone: clientRecord.phone || undefined,
        country: 'CI', // Default to CI (Côte d'Ivoire) as standard country scope
      },
      successUrl: `${getAppUrl()}/portal/invoices/${invoiceId}?status=success`,
      errorUrl: `${getAppUrl()}/portal/invoices/${invoiceId}?status=failed`,
      metadata: {
        organization_id: organizationId,
        invoice_id: invoiceId,
        payment_intent_id: localIntent.id,
      },
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'GeniusPay initiation failed');
    }

    // 7. Update local Payment Intent with Gateway reference & URLs
    const [updatedIntent] = await db
      .update(paymentIntents)
      .set({
        gatewayReference: response.data.reference,
        checkoutUrl: response.data.checkout_url || response.data.payment_url || null,
        status: 'pending',
        gatewayStatus: response.data.status,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, localIntent.id))
      .returning();

    return updatedIntent;
  } catch (err: any) {
    // If initiation failed, mark intent as failed
    await db
      .update(paymentIntents)
      .set({
        status: 'failed',
        failureReason: err.message || 'GeniusPay initiation call failed',
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, localIntent.id));

    if (err instanceof ApiError) throw err;

    // A gateway refusal is not an application crash. Raised as a typed error so
    // the portal shows the client something actionable instead of the generic
    // "An unexpected error occurred" that a bare `Error` turns into.
    console.error('GeniusPay initiation failed:', err);
    throw new ApiError(
      'PAYMENT_INITIATION_FAILED',
      'Le paiement en ligne est momentanément indisponible. Réessayez ou réglez par virement.',
      502
    );
  }
}

/**
 * Validates, records, and processes GeniusPay webhooks. Implements the 9-step security pipeline.
 */
export async function processGeniusPayWebhook(
  headers: Record<string, string>,
  rawBody: string,
  clientIp?: string
): Promise<{ status: number; body: { success: boolean; error?: string; message?: string } }> {
  // Validate Content-Type
  const contentType = headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return { status: 400, body: { success: false, error: 'Invalid content type' } };
  }

  const signature = headers['x-webhook-signature'];
  const timestampStr = headers['x-webhook-timestamp'];
  const eventTypeHeader = headers['x-webhook-event'];
  const environmentHeader = headers['x-webhook-environment'];

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { status: 400, body: { success: false, error: 'Invalid JSON payload' } };
  }

  const eventId = payload.id;
  const eventType = payload.event || eventTypeHeader;
  const environment = payload.environment || environmentHeader || 'sandbox';

  if (!eventId || !eventType) {
    return { status: 400, body: { success: false, error: 'Missing required payload parameters' } };
  }

  // Step 1: Immediate insertion into payment_webhook_events log (with signatureValid = false initially)
  let webhookEventRecord: any;
  try {
    const [inserted] = await db
      .insert(paymentWebhookEvents)
      .values({
        provider: 'geniuspay',
        eventId,
        eventType,
        environment,
        rawPayload: payload,
        signatureValid: false,
        receivedFromIp: clientIp || null,
      })
      .returning();
    webhookEventRecord = inserted;
  } catch (err: any) {
    // Unique constraint on (provider, event_id) detects duplicates (Step 6 detection early or postgres-level)
    if (err.code === '23505') {
      return { status: 200, body: { success: true, message: 'Duplicate event already logged' } };
    }
    throw err;
  }

  // Step 2: Timestamp validity check (|now - timestamp| > 300s)
  const timestamp = Number(timestampStr || payload.timestamp);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: 'timestamp_expired',
        signatureValid: false,
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 400, body: { success: false, error: 'Timestamp expired' } };
  }

  // Step 3: Resolve Organization via metadata.organization_id
  const orgId = payload.data?.metadata?.organization_id || payload.data?.metadata?.org_id;
  if (!orgId) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: 'org_not_found',
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 200, body: { success: true, message: 'Organization ID not found in metadata' } };
  }

  // Update webhook log with organizationId
  await db
    .update(paymentWebhookEvents)
    .set({ organizationId: orgId })
    .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

  // Step 4: Fetch credentials
  const [credentials] = await db
    .select()
    .from(paymentGatewayCredentials)
    .where(
      and(
        eq(paymentGatewayCredentials.organizationId, orgId),
        eq(paymentGatewayCredentials.provider, 'geniuspay'),
        eq(paymentGatewayCredentials.environment, environment),
        eq(paymentGatewayCredentials.status, 'active')
      )
    );

  if (!credentials) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: 'credentials_not_found',
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 200, body: { success: true, message: 'Gateway credentials not configured' } };
  }

  // Step 5: Verification of Signature
  const webhookSecret = decryptSecret(credentials.webhookSecretEncrypted, credentials.webhookSecretNonce);
  const signatureValid = GeniusPayClient.verifyWebhookSignature(signature, timestampStr, rawBody, webhookSecret);

  if (!signatureValid) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: 'invalid_signature',
        signatureValid: false,
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 401, body: { success: false, error: 'Invalid signature' } };
  }

  // Mark signature as valid in DB
  await db
    .update(paymentWebhookEvents)
    .set({ signatureValid: true })
    .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

  // Step 7: Re-fetch GeniusPay transaction to prevent spoofing
  const reference = payload.data?.reference;
  if (!reference) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: 'missing_reference',
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 200, body: { success: true, message: 'Missing transaction reference' } };
  }

  const apiSecret = decryptSecret(credentials.apiSecretEncrypted, credentials.apiSecretNonce);
  const client = new GeniusPayClient(credentials.apiKeyPublic, apiSecret, environment as 'sandbox' | 'live');

  let refetchedPayment: any;
  try {
    refetchedPayment = await client.getPayment(reference);
  } catch (err: any) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: `refetch_failed: ${err.message}`,
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 200, body: { success: true, message: 'Failed to re-fetch payment from GeniusPay' } };
  }

  // Mismatch verification
  const payloadAmount = Number(payload.data?.amount);
  const refetchedAmount = Number(refetchedPayment.data?.amount);

  if (Math.abs(payloadAmount - refetchedAmount) > 0.01) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: 'amount_mismatch',
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    console.error(`CRITICAL SECURITY ALERT: Webhook amount mismatch for reference ${reference}. Payload: ${payloadAmount}, Refetched: ${refetchedAmount}`);
    return { status: 200, body: { success: true, message: 'Amount mismatch detected' } };
  }

  // Step 8: Apply Business Logic
  try {
    // Find matching local intent
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.gatewayReference, reference), eq(paymentIntents.organizationId, orgId)));

    if (eventType === 'payment.success') {
      // The gateway reports amounts in the currency's normal unit; storage uses
      // its minor unit. `* 100` was hardcoded here, which for XOF — a currency
      // with no minor unit — inflated fees and the net amount a hundredfold.
      const gatewayCurrency = intent?.currency || refetchedPayment.data?.currency || 'XOF';
      const feesCents = fromGatewayAmount(refetchedPayment.data?.fees, gatewayCurrency);
      const netCents = fromGatewayAmount(refetchedPayment.data?.net_amount, gatewayCurrency);
      const settledCents = fromGatewayAmount(refetchedAmount, gatewayCurrency);

      // What the gateway actually collected must match what we asked for. The
      // check above only compared the webhook body against the re-fetched
      // transaction — both gateway-side — so a payment for a different amount
      // than the intent was credited as if it settled the intent in full.
      if (intent && settledCents !== BigInt(intent.amountCents)) {
        await db
          .update(paymentWebhookEvents)
          .set({ processingError: 'amount_differs_from_intent' })
          .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

        console.error(
          `CRITICAL SECURITY ALERT: settled amount differs from intent ${intent.id}. ` +
            `Gateway: ${settledCents}, intent: ${intent.amountCents}`
        );
        return {
          status: 200,
          body: { success: true, message: 'Settled amount differs from the payment intent' },
        };
      }

      if (intent) {
        await db
          .update(paymentIntents)
          .set({
            status: 'succeeded',
            gatewayStatus: refetchedPayment.data?.status || 'completed',
            gatewayPaymentMethod: refetchedPayment.data?.payment_method || null,
            gatewayFeesCents: feesCents,
            gatewayNetCents: netCents,
            succeededAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(paymentIntents.id, intent.id));
      }

      // Record the payment on the invoice
      const invoiceId = intent?.invoiceId || payload.data?.metadata?.invoice_id;
      if (invoiceId) {
        await recordInvoicePayment(
          orgId,
          invoiceId,
          {
            // The amount the gateway confirms, not the one we hoped for. They
            // are now known to be equal when an intent exists, and this is the
            // only correct value when it does not.
            amountCents: settledCents,
            method: 'geniuspay',
            source: 'geniuspay',
            paymentIntentId: intent?.id || null,
            gatewayReference: reference,
            gatewayFeesCents: feesCents,
            paidAt: refetchedPayment.data?.completed_at ? new Date(refetchedPayment.data.completed_at) : new Date(),
          },
          null,
          null
        );
      }
    } else if (['payment.failed', 'payment.cancelled', 'payment.expired'].includes(eventType)) {
      let localStatus: string = 'failed';
      if (eventType === 'payment.cancelled') localStatus = 'cancelled';
      if (eventType === 'payment.expired') localStatus = 'expired';

      if (intent) {
        const failureReason =
          refetchedPayment.data?.failure_reason || `GeniusPay event: ${eventType}`;

        await db
          .update(paymentIntents)
          .set({
            status: localStatus,
            gatewayStatus: refetchedPayment.data?.status || 'failed',
            failedAt: new Date(),
            failureReason,
            updatedAt: new Date(),
          })
          .where(eq(paymentIntents.id, intent.id));

        // MVP3 §6: notifies the client so they can retry (MVP5 §3.2).
        if (eventType === 'payment.failed' && intent.invoiceId) {
          try {
            const [invoice] = await db
              .select()
              .from(invoices)
              .where(eq(invoices.id, intent.invoiceId))
              .limit(1);

            if (invoice) {
              const payload = await buildEventPayload({
                organizationId: orgId,
                entityKind: 'invoice',
                entityId: invoice.id,
                entity: invoice,
                withPortalUrl: true,
                extra: { failureReason },
              });
              await emit('invoice.payment_failed', orgId, payload);
            }
          } catch (emitErr) {
            // The payment state is already recorded; a failed notification
            // must not make the webhook retry and reprocess it.
            console.error('Failed to emit invoice.payment_failed:', emitErr);
          }
        }
      }
    } else if (eventType === 'payment.refunded') {
      // Refunded event: Record a negative payment on the invoice
      const invoiceId = intent?.invoiceId || payload.data?.metadata?.invoice_id;
      if (invoiceId) {
        const refundAmount = BigInt(Math.round(refetchedAmount * 100));
        await recordInvoicePayment(
          orgId,
          invoiceId,
          {
            amountCents: -refundAmount, // Negative amount representing refund
            method: 'geniuspay',
            source: 'geniuspay',
            paymentIntentId: intent?.id || null,
            gatewayReference: `${reference}-refund`,
            gatewayFeesCents: 0n,
            paidAt: new Date(),
            notes: 'Refunded via GeniusPay webhook',
          },
          null,
          null
        );
      }
    }

    // Step 9: Acknowledge processed
    await db
      .update(paymentWebhookEvents)
      .set({
        processedAt: new Date(),
        processingError: null,
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    return { status: 200, body: { success: true, message: 'Webhook processed successfully' } };
  } catch (err: any) {
    await db
      .update(paymentWebhookEvents)
      .set({
        processingError: `processing_error: ${err.message}`,
      })
      .where(eq(paymentWebhookEvents.id, webhookEventRecord.id));

    throw err;
  }
}

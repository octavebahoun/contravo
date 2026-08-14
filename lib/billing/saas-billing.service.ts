import { db } from '../db/drizzle';
import {
  subscriptions,
  subscriptionCycles,
  subscriptionPaymentAttempts,
  organizations,
  users,
  memberships,
} from '../db/schema';
import { PLANS, PlanId } from './plans';
import { eq, and, desc, sql } from 'drizzle-orm';
import { GeniusPayClient } from '../payments/geniuspay/geniuspay-client';
import { emit } from '../webhooks';
import { getSubscription } from './quotas.service';

export class BillingServiceError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'BillingServiceError';
  }
}

/**
 * Initiate subscription or plan change to a paid tier (Pro / Business)
 */
export async function createSubscriptionCheckout(
  organizationId: string,
  userId: string,
  targetPlanId: PlanId
) {
  if (targetPlanId === 'free') {
    throw new BillingServiceError('Pour passer au plan Gratuit, utilisez le bouton d’annulation ou de rétrogradation', 400);
  }

  const targetPlan = PLANS[targetPlanId];
  if (!targetPlan) {
    throw new BillingServiceError('Plan invalide', 400);
  }

  // Verify user is owner or admin of organization
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new BillingServiceError('Permission refusée : seul un administrateur ou propriétaire peut modifier l’abonnement', 403);
  }

  // Get current active subscription
  let currentSub = await getSubscription(organizationId);

  // Get latest cycle number
  const [lastCycle] = await db
    .select()
    .from(subscriptionCycles)
    .where(eq(subscriptionCycles.subscriptionId, currentSub.id))
    .orderBy(desc(subscriptionCycles.cycleNumber))
    .limit(1);

  const nextCycleNumber = (lastCycle?.cycleNumber || 0) + 1;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const invoiceNumber = `SAAS-${now.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  // Create cycle row
  const [cycle] = await db
    .insert(subscriptionCycles)
    .values({
      subscriptionId: currentSub.id,
      organizationId,
      cycleNumber: nextCycleNumber,
      planId: targetPlanId,
      amountCents: BigInt(targetPlan.priceMonthlyCents),
      currency: targetPlan.currency,
      periodStart: now,
      periodEnd,
      status: 'pending',
      invoiceNumber,
    })
    .returning();

  // Create payment attempt row
  const [attempt] = await db
    .insert(subscriptionPaymentAttempts)
    .values({
      cycleId: cycle.id,
      organizationId,
      attemptNumber: 1,
      status: 'pending',
      amountCents: BigInt(targetPlan.priceMonthlyCents),
    })
    .returning();

  // Configure GeniusPay Excellence Client
  const apiKeyPublic = process.env.EXCELLENCE_GENIUSPAY_API_KEY_PUBLIC;
  const apiSecret = process.env.EXCELLENCE_GENIUSPAY_API_SECRET;
  const env = (process.env.EXCELLENCE_GENIUSPAY_ENV as 'sandbox' | 'live') || 'sandbox';

  let checkoutUrl: string;
  let gatewayReference: string | null = null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://contravo-7g6p.vercel.app';
  const successUrl = `${baseUrl}/dashboard/billing?status=success&cycle_id=${cycle.id}`;
  const errorUrl = `${baseUrl}/dashboard/billing?status=failed&cycle_id=${cycle.id}`;

  if (apiKeyPublic && apiSecret) {
    const geniusClient = new GeniusPayClient(apiKeyPublic, apiSecret, env);
    try {
      const response = await geniusClient.initiatePayment({
        amount: targetPlan.priceMonthlyCents / 100,
        currency: targetPlan.currency,
        description: `Abonnement Contravo SaaS ${targetPlan.name}`,
        successUrl,
        errorUrl,
        metadata: {
          kind: 'saas_subscription',
          org_id: organizationId,
          cycle_id: cycle.id,
          attempt_id: attempt.id,
          plan_id: targetPlanId,
        },
      });

      if (response.success && response.data) {
        gatewayReference = response.data.reference;
        checkoutUrl = response.data.checkout_url || response.data.payment_url || `${baseUrl}/dashboard/billing`;
      } else {
        checkoutUrl = `${baseUrl}/dashboard/billing?error=payment_initiation_failed`;
      }
    } catch (err: any) {
      console.error('Failed to initiate GeniusPay Excellence payment:', err);
      checkoutUrl = `${baseUrl}/dashboard/billing?error=payment_initiation_failed`;
    }
  } else {
    // Fallback / Sandbox URL generator when env not populated
    gatewayReference = `MTX-SAAS-${Date.now()}`;
    checkoutUrl = `${baseUrl}/dashboard/billing?simulated_checkout=1&attempt_id=${attempt.id}&ref=${gatewayReference}`;
  }

  // Update attempt with gateway reference & checkout url
  await db
    .update(subscriptionPaymentAttempts)
    .set({
      gatewayReference,
      checkoutUrl,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPaymentAttempts.id, attempt.id));

  return {
    cycleId: cycle.id,
    attemptId: attempt.id,
    checkoutUrl,
    invoiceNumber,
    amountCents: targetPlan.priceMonthlyCents,
  };
}

/**
 * Process dedicated Webhook events from GeniusPay Excellence (SaaS Billing)
 */
export async function processExcellenceWebhook(
  headers: Record<string, string>,
  rawBody: string,
  clientIp?: string
) {
  const webhookSecret = process.env.EXCELLENCE_GENIUSPAY_WEBHOOK_SECRET;
  const signature = headers['x-webhook-signature'];
  const timestampStr = headers['x-webhook-timestamp'];

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { status: 400, body: { success: false, error: 'Invalid JSON payload' } };
  }

  const eventType = payload.event || headers['x-webhook-event'];
  const metadata = payload.data?.metadata || {};

  if (metadata.kind !== 'saas_subscription' && !metadata.attempt_id) {
    return { status: 200, body: { success: true, message: 'Ignored: not a SaaS subscription event' } };
  }

  // Verify HMAC signature if secret is provided
  if (webhookSecret && signature && timestampStr) {
    const signatureValid = GeniusPayClient.verifyWebhookSignature(signature, timestampStr, rawBody, webhookSecret);
    if (!signatureValid) {
      return { status: 401, body: { success: false, error: 'Invalid HMAC signature' } };
    }
  }

  const attemptId = metadata.attempt_id;
  const cycleId = metadata.cycle_id;
  const orgId = metadata.org_id;
  const planId = metadata.plan_id as PlanId;

  if (!attemptId || !cycleId || !orgId) {
    return { status: 400, body: { success: false, error: 'Missing metadata required identifiers' } };
  }

  if (eventType === 'payment.success') {
    // 1. Mark attempt succeeded
    await db
      .update(subscriptionPaymentAttempts)
      .set({
        status: 'succeeded',
        gatewayReference: payload.data?.reference || null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPaymentAttempts.id, attemptId));

    // 2. Mark cycle paid
    const [cycle] = await db
      .update(subscriptionCycles)
      .set({
        status: 'paid',
        paidAt: new Date(),
      })
      .where(eq(subscriptionCycles.id, cycleId))
      .returning();

    // 3. Update subscription
    if (cycle) {
      await db
        .update(subscriptions)
        .set({
          planId: cycle.planId,
          status: 'active',
          currentPeriodStart: cycle.periodStart,
          currentPeriodEnd: cycle.periodEnd,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.organizationId, orgId));

      // Emit event for n8n email notification
      try {
        await emit('subscription.activated', orgId, {
          organizationId: orgId,
          cycleId: cycle.id,
          invoiceNumber: cycle.invoiceNumber,
          planId: cycle.planId,
          amountCents: Number(cycle.amountCents),
          paidAt: cycle.paidAt,
        });
      } catch (err) {
        console.error('Failed to emit subscription.activated event:', err);
      }
    }

    return { status: 200, body: { success: true, message: 'Subscription successfully activated' } };
  } else if (['payment.failed', 'payment.cancelled'].includes(eventType)) {
    await db
      .update(subscriptionPaymentAttempts)
      .set({
        status: 'failed',
        failureReason: payload.data?.failure_reason || `Event ${eventType}`,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPaymentAttempts.id, attemptId));

    await db
      .update(subscriptionCycles)
      .set({
        status: 'failed',
        failedReason: payload.data?.failure_reason || `Event ${eventType}`,
      })
      .where(eq(subscriptionCycles.id, cycleId));

    return { status: 200, body: { success: true, message: 'Subscription attempt marked failed' } };
  }

  return { status: 200, body: { success: true, message: 'Event recorded' } };
}

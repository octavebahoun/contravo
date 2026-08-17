import { NextRequest, NextResponse } from 'next/server';
import { requirePortalAccess } from '@/lib/portal/portal-guard';
import { createPaymentIntent } from '@/lib/payments/geniuspay/payment-intents.service';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Starts an online payment for an invoice, from the client portal (MVP3 §5).
 *
 * `createPaymentIntent()` existed but no route called it, so the "pay online"
 * half of the flow was unreachable: the client could read the bank details and
 * nothing more. The webhook half was already complete — it verifies the HMAC
 * signature, refuses stale timestamps, is idempotent on `(provider, event_id)`
 * and **re-fetches the transaction from GeniusPay before crediting anything**,
 * so what the gateway confirms is never taken from the request body.
 *
 * The public token is deliberately *not* consumed here: a client who abandons
 * the checkout page must be able to come back and try again. It is the gateway
 * webhook that settles the invoice, not this call.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePortalAccess('pay');
    const { id } = await params;

    const intent = await createPaymentIntent({
      organizationId: ctx.organizationId,
      invoiceId: id,
      initiatedFromIp:
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
    });

    if (!intent?.checkoutUrl) {
      return NextResponse.json(
        {
          error: {
            code: 'PAYMENT_INITIATION_FAILED',
            message: 'La passerelle de paiement n’a pas renvoyé de lien de règlement.',
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        paymentIntentId: intent.id,
        checkoutUrl: intent.checkoutUrl,
        amountCents: intent.amountCents.toString(),
        currency: intent.currency,
        expiresAt: intent.expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    return formatErrorResponse(err);
  }
}

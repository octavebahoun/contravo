import { NextRequest, NextResponse } from 'next/server';
import { requirePortalAccess } from '@/lib/portal/portal-guard';
import { consumePublicToken } from '@/lib/public-tokens';
import { transitionQuote } from '@/lib/workflows/quote.state';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/**
 * Records the client's decision on a quote from the portal (MVP3 §3, §5).
 *
 * Runs the real state transition — the previous implementation emitted
 * `quote.signed` and answered success while the quote stayed in its former
 * state, so an accepted quote never became `accepted` and never spawned its
 * contract. The transition itself emits `quote.accepted` / `quote.rejected`.
 */
const decisionSchema = z.object({
  decision: z.enum(['accept', 'reject']).default('accept'),
  signerName: z.string().min(1),
  signerEmail: z.string().email(),
  /** Reason shown to the issuer; only meaningful when rejecting. */
  reason: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requirePortalAccess('sign');
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const result = decisionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: 'Invalid request body',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    const { decision, signerName, signerEmail, reason } = result.data;

    // The decision must come from the person the link was issued to.
    if (!ctx.recipientEmail || signerEmail.toLowerCase() !== ctx.recipientEmail.toLowerCase()) {
      return NextResponse.json(
        {
          error: 'identity_mismatch',
          message: 'Signer email does not match public token recipient',
        },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

    const quote = await transitionQuote(
      ctx.organizationId,
      id,
      decision === 'accept' ? 'accept' : 'reject',
      {
        acceptedByName: signerName,
        acceptedByEmail: signerEmail,
        acceptedByIp: ip,
        rejectionReason: reason,
      },
      null,
      ip
    );

    // Consumed only once the decision is committed, so a failed attempt does
    // not burn one of the token's allowed uses.
    await consumePublicToken(ctx.publicTokenId!, ip);

    return NextResponse.json({
      success: true,
      decision,
      status: quote.status,
      decidedAt: new Date().toISOString(),
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

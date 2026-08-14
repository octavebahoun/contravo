import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';
import { consumePublicToken } from '@/lib/public-tokens';
import { signContract } from '@/lib/signatures/sign.service';
import { formatErrorResponse } from '@/lib/errors';
import { emit } from '@/lib/webhooks';
import { z } from 'zod';

const signSchema = z.object({
  signerName: z.string().min(1),
  signerEmail: z.string().email(),
  /** Canvas PNG, as `data:image/png;base64,...` or bare base64. */
  signatureBase64: z.string().min(1),
  /** Explicit consent checkbox from the portal (MVP4 §7.1 step 3). */
  acceptedTerms: z.boolean().optional(),
});

/**
 * Signs a contract from the client portal (MVP4 §7).
 *
 * Runs the full pipeline through `signContract`: stores the canvas, hashes the
 * original PDF, composes the signed PDF with its certificate page, writes the
 * immutable signature row and flips the contract to `signed` — all atomically.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;

  try {
    const ctx = await getApiContext();

    if (ctx.authType !== 'public_token') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Only public token access allowed' },
        { status: 403 }
      );
    }

    if (!ctx.scopes.includes('sign') && !ctx.scopes.includes('*')) {
      return NextResponse.json(
        { error: 'permission_denied', message: 'Missing required scope: sign' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const result = signSchema.safeParse(body);

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

    const { signerName, signerEmail, signatureBase64, acceptedTerms } = result.data;

    if (acceptedTerms === false) {
      return NextResponse.json(
        { error: 'terms_not_accepted', message: 'Terms must be accepted to sign' },
        { status: 400 }
      );
    }

    // The signer must be the person the token was issued to.
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
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const signature = await signContract({
      contractId: id,
      organizationId: ctx.organizationId,
      publicTokenId: ctx.publicTokenId!,
      signerName,
      signerEmail,
      signerIp: ip,
      signerUserAgent: userAgent,
      signatureCanvasBase64: signatureBase64,
    });

    // Consume the token only once the signature is durably recorded, so a
    // failed attempt does not burn one of the allowed uses.
    await consumePublicToken(ctx.publicTokenId!, ip);

    await emit('contract.signed', ctx.organizationId, {
      contractId: id,
      signatureId: signature.signatureId,
      signerName,
      signerEmail,
      signedAt: signature.signedAt,
      signedPdfFileId: signature.signedPdfFileId,
      documentSha256: signature.documentSha256,
      signatureSha256: signature.signatureSha256,
    });

    return NextResponse.json({
      success: true,
      message: 'Contract signed successfully',
      signatureId: signature.signatureId,
      signedAt: signature.signedAt,
      documentSha256: signature.documentSha256,
      signatureSha256: signature.signatureSha256,
    });
  } catch (err) {
    return formatErrorResponse(err, requestId);
  }
}

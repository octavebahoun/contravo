import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';
import { consumePublicToken } from '@/lib/public-tokens';
import { emit } from '@/lib/webhooks';
import { z } from 'zod';

const signSchema = z.object({
  signerName: z.string().min(1),
  signerEmail: z.string().email(),
  signatureBase64: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { signerName, signerEmail, signatureBase64 } = result.data;

    // Check identity
    if (signerEmail.toLowerCase() !== ctx.recipientEmail.toLowerCase()) {
      return NextResponse.json(
        {
          error: 'identity_mismatch',
          message: 'Signer email does not match public token recipient',
        },
        { status: 403 }
      );
    }

    // Consume the token (this increments the usedCount, enforcing max_uses limit)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    await consumePublicToken(ctx.publicTokenId!, ip);

    // Emit event to webhook endpoints
    await emit('quote.signed', ctx.organizationId, {
      quoteId: id,
      signerName,
      signerEmail,
      signedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Quote signed successfully',
      signedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}

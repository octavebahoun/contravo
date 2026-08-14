import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { contracts, files, organizations, signatures } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimitIp } from '@/lib/rate-limit';
import { computeSignatureHash } from '@/lib/signatures/sign.service';

/**
 * Public signature verification endpoint (MVP4 §7.3).
 *
 * Lets any third party — a lawyer, a court, the counterparty — check that a
 * signed PDF they hold matches the signature recorded here. Deliberately
 * unauthenticated: proof that cannot be checked without an account is not proof.
 *
 * Only non-sensitive fields are returned. The signer IP and user agent stay
 * private; they are evidence held by the platform, not public data.
 *
 * Optional `?sha256=<hex>` compares a caller-supplied file digest against the
 * stored one, answering "is the document I have the one that was signed?".
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ signatureId: string }> }
) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

  const rateLimitResult = await rateLimitIp(ip, 100);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests' },
      { status: 429 }
    );
  }

  const { signatureId } = await params;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(signatureId)) {
    return NextResponse.json(
      { valid: false, error: 'not_found', message: 'Signature not found' },
      { status: 404 }
    );
  }

  const [signature] = await db
    .select()
    .from(signatures)
    .where(eq(signatures.id, signatureId))
    .limit(1);

  if (!signature) {
    return NextResponse.json(
      { valid: false, error: 'not_found', message: 'Signature not found' },
      { status: 404 }
    );
  }

  const [contract] = await db
    .select({ number: contracts.number, title: contracts.title })
    .from(contracts)
    .where(eq(contracts.id, signature.entityId))
    .limit(1);

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, signature.organizationId))
    .limit(1);

  const [signedFile] = await db
    .select({ sha256: files.sha256, sizeBytes: files.sizeBytes })
    .from(files)
    .where(eq(files.id, signature.signedPdfFileId))
    .limit(1);

  const signedAtIso = signature.signedAt.toISOString();

  // Recompute the proof from the stored components: a mismatch means the
  // signature row itself was tampered with after the fact.
  const recomputed = computeSignatureHash(
    signature.signerEmail,
    signedAtIso,
    signature.documentSha256
  );
  const chainIntact = recomputed === signature.signatureSha256;

  // Optional caller-supplied digest of the signed PDF they hold.
  const providedSha256 = request.nextUrl.searchParams.get('sha256')?.toLowerCase() ?? null;
  const documentMatches =
    providedSha256 && signedFile?.sha256
      ? providedSha256 === signedFile.sha256.toLowerCase()
      : null;

  return NextResponse.json({
    valid: chainIntact && documentMatches !== false,
    signature: {
      id: signature.id,
      entityType: signature.entityType,
      entityId: signature.entityId,
      signerName: signature.signerName,
      signerEmail: signature.signerEmail,
      signedAt: signedAtIso,
      otpVerified: signature.otpVerified,
    },
    document: {
      organization: org?.name ?? null,
      number: contract?.number ?? null,
      title: contract?.title ?? null,
      originalSha256: signature.documentSha256,
      signedPdfSha256: signedFile?.sha256 ?? null,
      signedPdfSizeBytes: signedFile ? Number(signedFile.sizeBytes) : null,
    },
    proof: {
      signatureSha256: signature.signatureSha256,
      algorithm: 'SHA-256(signer_email || signed_at_iso || document_sha256)',
      chainIntact,
      /** null when the caller did not supply ?sha256= to compare. */
      documentMatches,
    },
    legal: {
      scheme: 'simple_electronic_signature',
      framework: 'eIDAS (UE) 910/2014',
      note: 'Signature électronique simple : ni avancée, ni qualifiée.',
    },
  });
}

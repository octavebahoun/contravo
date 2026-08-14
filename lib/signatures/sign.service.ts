import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import { auditLogs, contracts, files, signatures } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { uploadServerFile, deleteFile } from '@/lib/storage/upload-service';
import { renderSignedContractPdf } from '@/lib/pdf/generate.service';
import { generateContractPdf } from '@/lib/pdf/generate.service';

/**
 * Contract signing pipeline (MVP4 §7.2).
 *
 * Runs the nine steps of the spec: validate the contract, store the signature
 * canvas, hash the original document, compose the signed PDF, record an
 * immutable `signatures` row and flip the contract to `signed`.
 *
 * Ordering is deliberate. R2 uploads cannot participate in a Postgres
 * transaction, so every upload happens *before* the transaction opens and the
 * keys are tracked; if the transaction fails, the orphaned objects are deleted
 * on the way out. The database is therefore the single source of truth: a
 * contract is signed only if the transaction committed.
 */

export type SignContractParams = {
  contractId: string;
  organizationId: string;
  publicTokenId: string;
  signerName: string;
  signerEmail: string;
  signerIp: string;
  signerUserAgent: string;
  /** Canvas drawing, `data:image/png;base64,...` or bare base64. */
  signatureCanvasBase64: string;
};

export type SignContractResult = {
  signatureId: string;
  signedAt: string;
  documentSha256: string;
  signatureSha256: string;
  signedPdfFileId: string;
};

/** Canvas signatures are small drawings; anything larger is rejected. */
const MAX_CANVAS_BYTES = 2 * 1024 * 1024;

/**
 * Decodes and validates the canvas payload.
 *
 * @throws ApiError 400 when the payload is not a decodable PNG within limits.
 */
function decodeCanvas(input: string): Buffer {
  const base64 = input.startsWith('data:')
    ? input.slice(input.indexOf(',') + 1)
    : input;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Signature image is not valid base64', 400);
  }

  if (buffer.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Signature image is empty', 400);
  }
  if (buffer.length > MAX_CANVAS_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'Signature image exceeds 2 MB', 413);
  }

  // PNG magic number: the canvas element always exports PNG.
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) {
    throw new ApiError('VALIDATION_ERROR', 'Signature image must be a PNG', 400);
  }

  return buffer;
}

/**
 * Computes the signature proof hash (MVP4 §7.2 step 5).
 *
 * SHA-256 over `signer_email || iso_timestamp || document_sha256`, so the proof
 * binds the signer identity, the moment of signing and the exact document.
 */
export function computeSignatureHash(
  signerEmail: string,
  isoTimestamp: string,
  documentSha256: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${signerEmail}${isoTimestamp}${documentSha256}`)
    .digest('hex');
}

/**
 * Signs a contract end to end.
 *
 * @throws ApiError 404 when the contract is absent, 409 when it is not in a
 *   signable state or already signed.
 */
export async function signContract(
  params: SignContractParams
): Promise<SignContractResult> {
  const {
    contractId,
    organizationId,
    publicTokenId,
    signerName,
    signerEmail,
    signerIp,
    signerUserAgent,
    signatureCanvasBase64,
  } = params;

  // Step 2 — validate the entity before doing any expensive work.
  const [contract] = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.id, contractId),
        eq(contracts.organizationId, organizationId),
        isNull(contracts.deletedAt)
      )
    )
    .limit(1);

  if (!contract) {
    throw new ApiError('NOT_FOUND', 'Contract not found', 404);
  }
  if (contract.status === 'signed' || contract.signedAt) {
    throw new ApiError('CONFLICT', 'Contract is already signed', 409);
  }
  if (contract.status !== 'sent') {
    throw new ApiError(
      'CONFLICT',
      `Contract must be in status 'sent' to be signed (current: ${contract.status})`,
      409
    );
  }

  const canvasBuffer = decodeCanvas(signatureCanvasBase64);

  // Track files written outside the transaction so they can be cleaned up.
  // File IDs, not R2 keys: rolling back must also drop the `files` rows and
  // release the storage quota they consumed, not just the bucket objects.
  const uploadedFileIds: string[] = [];

  try {
    // Step 3 — store the canvas.
    const canvasFile = await uploadServerFile(
      organizationId,
      null,
      'signature_canvas',
      `${contract.number}-signature.png`,
      'image/png',
      canvasBuffer,
      'contract',
      contractId,
      'public_token',
      signerIp
    );
    uploadedFileIds.push(canvasFile.id);

    // Step 4 — hash the original document. Generate it if it was never rendered,
    // so the proof always references a document that actually exists in R2.
    let documentSha256: string | null = null;
    if (contract.pdfFileId) {
      const [original] = await db
        .select()
        .from(files)
        .where(eq(files.id, contract.pdfFileId))
        .limit(1);
      documentSha256 = original?.sha256 ?? null;
    }
    if (!documentSha256) {
      // Deliberately not tracked for rollback: this is the contract's own
      // unsigned PDF, which stays valid and linked whether or not signing
      // succeeds. Deleting it would strip an existing contract of its document.
      const generated = await generateContractPdf(contractId, organizationId, signerIp);
      documentSha256 = generated.sha256;
    }

    // Step 5 — compose the signed PDF. The timestamp is fixed here and reused
    // for the hash, the PDF and the DB row so all three agree exactly.
    const signedAtDate = new Date();
    const signedAtIso = signedAtDate.toISOString();
    const signatureSha256 = computeSignatureHash(signerEmail, signedAtIso, documentSha256);

    // Step 6 — store the signed PDF.
    const signedPdf = await renderSignedContractPdf(
      contractId,
      organizationId,
      {
        signerName,
        signerEmail,
        signerIp,
        signedAt: signedAtIso,
        documentSha256,
        signatureSha256,
        signatureImageDataUri: `data:image/png;base64,${canvasBuffer.toString('base64')}`,
      },
      signerIp
    );
    uploadedFileIds.push(signedPdf.fileId);

    // Steps 7-9 — commit the proof atomically.
    const signatureId = await db.transaction(async (tx) => {
      // Guard against a concurrent signature landing between the check above
      // and this write.
      const [fresh] = await tx
        .select({ status: contracts.status, signedAt: contracts.signedAt })
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);

      if (!fresh || fresh.status === 'signed' || fresh.signedAt) {
        throw new ApiError('CONFLICT', 'Contract is already signed', 409);
      }

      const [signature] = await tx
        .insert(signatures)
        .values({
          organizationId,
          entityType: 'contract',
          entityId: contractId,
          signerName,
          signerEmail,
          signerIp,
          signerUserAgent,
          publicTokenId,
          canvasFileId: canvasFile.id,
          signedPdfFileId: signedPdf.fileId,
          documentSha256,
          signatureSha256,
          signedAt: signedAtDate,
        })
        .returning();

      await tx
        .update(contracts)
        .set({
          status: 'signed',
          signedAt: signedAtDate,
          signedByName: signerName,
          signedByEmail: signerEmail,
          signedByIp: signerIp,
          signedPdfFileId: signedPdf.fileId,
          signatureHash: signatureSha256,
          updatedAt: signedAtDate,
        })
        .where(eq(contracts.id, contractId));

      await tx.insert(auditLogs).values({
        organizationId,
        actorUserId: null,
        action: 'contract.signed',
        targetType: 'contract',
        targetId: contractId,
        metadata: {
          signatureId: signature.id,
          signerEmail,
          documentSha256,
          signatureSha256,
        },
        ipAddress: signerIp,
      });

      return signature.id;
    });

    return {
      signatureId,
      signedAt: signedAtIso,
      documentSha256,
      signatureSha256,
      signedPdfFileId: signedPdf.fileId,
    };
  } catch (error) {
    // The database rolled back, so the uploads are unreferenced: remove them
    // rather than leaving billable orphans in the bucket (MVP4 §7.2).
    await Promise.allSettled(
      uploadedFileIds.map((fileId) => deleteFile(fileId, organizationId, null, signerIp))
    );
    throw error;
  }
}

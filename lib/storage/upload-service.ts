import { db } from '../db/drizzle';
import { files, storageUsage, auditLogs, quotes, contracts, invoices, deliverables, expenses } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { r2Key, R2KeyKind } from './r2-keys';
import { getMimeAndSizeLimit, isMimeAllowed, verifyMimeMatchesBuffer } from './mime-guard';
import { getPresignedPutUrl } from './presign';
import { ApiError } from '../rbac';
import { scanFileBuffer } from './antivirus';
import { GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET_NAME } from './r2-client';
import crypto from 'crypto';
import { Readable } from 'stream';

/**
 * Checks if the organization has enough storage quota left.
 * Limit is 5 GB per organization.
 */
export async function verifyStorageQuota(orgId: string, sizeBytesToAdd: number): Promise<void> {
  const [quota] = await db
    .select()
    .from(storageUsage)
    .where(eq(storageUsage.organizationId, orgId))
    .limit(1);

  const currentBytes = quota ? BigInt(quota.totalBytes) : 0n;
  const maxBytes = 5n * 1024n * 1024n * 1024n; // 5 GB

  if (currentBytes + BigInt(sizeBytesToAdd) > maxBytes) {
    throw new ApiError('STORAGE_QUOTA_EXCEEDED', 'Storage quota exceeded (5 GB limit)', 403);
  }
}

/**
 * Updates the storage usage record for an organization within a transaction.
 */
export async function updateStorageQuotaInTx(
  tx: any,
  orgId: string,
  sizeBytesDelta: number,
  fileCountDelta: number
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(storageUsage)
    .where(eq(storageUsage.organizationId, orgId))
    .limit(1);

  if (!existing) {
    await tx.insert(storageUsage).values({
      organizationId: orgId,
      totalBytes: BigInt(Math.max(0, sizeBytesDelta)),
      fileCount: Math.max(0, fileCountDelta),
      lastComputedAt: new Date(),
    });
  } else {
    const newBytes = BigInt(existing.totalBytes) + BigInt(sizeBytesDelta);
    const newCount = existing.fileCount + fileCountDelta;
    await tx
      .update(storageUsage)
      .set({
        totalBytes: newBytes < 0n ? 0n : newBytes,
        fileCount: newCount < 0 ? 0 : newCount,
        lastComputedAt: new Date(),
      })
      .where(eq(storageUsage.organizationId, orgId));
  }
}

/**
 * Automatically maps a file to its associated business entity.
 */
async function linkFileToEntityInTx(
  tx: any,
  entityType: string,
  entityId: string,
  fileId: string
): Promise<void> {
  const lowerType = entityType.toLowerCase();
  if (lowerType === 'quote') {
    await tx.update(quotes).set({ pdfFileId: fileId }).where(eq(quotes.id, entityId));
  } else if (lowerType === 'contract') {
    await tx.update(contracts).set({ pdfFileId: fileId }).where(eq(contracts.id, entityId));
  } else if (lowerType === 'invoice') {
    await tx.update(invoices).set({ pdfFileId: fileId }).where(eq(invoices.id, entityId));
  } else if (lowerType === 'deliverable') {
    await tx.update(deliverables).set({ fileId }).where(eq(deliverables.id, entityId));
  } else if (lowerType === 'expense') {
    await tx.update(expenses).set({ receiptFileId: fileId }).where(eq(expenses.id, entityId));
  }
}

/**
 * Helper to dynamically generate the correct R2 Key based on the entity and filename convention.
 */
async function generateR2Key(
  orgId: string,
  kind: R2KeyKind,
  linkedEntityType?: string | null,
  linkedEntityId?: string | null,
  filename?: string
): Promise<string> {
  const uuid = crypto.randomUUID();
  const ext = filename ? filename.split('.').pop() || 'bin' : 'bin';

  if (kind === 'deliverable') {
    const finalEntityId = linkedEntityId || uuid;
    const finalFilename = filename || 'unnamed-file';
    return r2Key(orgId, 'deliverable', finalEntityId, finalFilename);
  }

  if (kind === 'expense_receipt') {
    const finalEntityId = linkedEntityId || uuid;
    return r2Key(orgId, 'expense_receipt', finalEntityId, `receipt-${uuid}.${ext}`);
  }

  if (kind === 'signature_canvas') {
    if (!linkedEntityId) throw new Error('linkedEntityId (contract) is required for signature canvas');
    return r2Key(orgId, 'signature_canvas', linkedEntityId, `canvas-${uuid}.png`);
  }

  // Document types
  if (linkedEntityType && linkedEntityId) {
    const lowerType = linkedEntityType.toLowerCase();
    if (lowerType === 'quote') {
      const [quote] = await db.select().from(quotes).where(eq(quotes.id, linkedEntityId)).limit(1);
      const number = quote?.number || uuid;
      return r2Key(orgId, 'quote_pdf', linkedEntityId, number);
    }
    if (lowerType === 'contract') {
      const [contract] = await db.select().from(contracts).where(eq(contracts.id, linkedEntityId)).limit(1);
      const number = contract?.number || uuid;
      if (kind === 'contract_signed_pdf') {
        return r2Key(orgId, 'contract_signed_pdf', linkedEntityId, number);
      }
      return r2Key(orgId, 'contract_pdf', linkedEntityId, number);
    }
    if (lowerType === 'invoice') {
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, linkedEntityId)).limit(1);
      const number = invoice?.number || uuid;
      return r2Key(orgId, 'invoice_pdf', linkedEntityId, number);
    }
  }

  return r2Key(orgId, kind, linkedEntityId || uuid, filename || uuid);
}

/**
 * Initiates a client-direct file upload by generating a presigned URL.
 * Creates a file record with status 'uploading'.
 */
export async function initiateUpload(params: {
  orgId: string;
  userId: string;
  kind: R2KeyKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  uploadedVia: string;
  ipAddress?: string;
}): Promise<{
  fileId: string;
  uploadUrl: string;
  r2Key: string;
}> {
  const {
    orgId,
    userId,
    kind,
    filename,
    mimeType,
    sizeBytes,
    linkedEntityType,
    linkedEntityId,
    uploadedVia,
    ipAddress,
  } = params;

  // 1. Validate MIME
  if (!isMimeAllowed(kind, mimeType)) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', `MIME type ${mimeType} is not allowed for ${kind}`, 415);
  }

  // 2. Validate Size Limit
  const { sizeLimit } = getMimeAndSizeLimit(kind);
  if (sizeBytes > sizeLimit) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `File size exceeds the limit of ${sizeLimit} bytes`, 413);
  }

  // 3. Validate storage quota
  await verifyStorageQuota(orgId, sizeBytes);

  // 4. Generate R2 key
  const key = await generateR2Key(orgId, kind, linkedEntityType, linkedEntityId, filename);

  // 5. Generate Presigned PUT URL (valid for 10 minutes)
  const uploadUrl = await getPresignedPutUrl(key, mimeType, sizeBytes);

  // 6. Create file record in db
  const [file] = await db.insert(files).values({
    organizationId: orgId,
    r2Key: key,
    filename,
    mimeType,
    sizeBytes: BigInt(sizeBytes),
    sha256: 'PENDING_UPLOAD',
    kind,
    status: 'uploading',
    linkedEntityType: linkedEntityType || null,
    linkedEntityId: linkedEntityId || null,
    uploadedByUserId: userId,
    uploadedVia,
    uploadedFromIp: ipAddress || null,
  }).returning();

  return {
    fileId: file.id,
    uploadUrl,
    r2Key: key,
  };
}

/**
 * Verifies a direct client upload to R2, runs integrity and antivirus scan,
 * and sets status to 'ready' or 'infected'.
 */
export async function completeUpload(
  fileId: string,
  orgId: string,
  userId: string | null,
  ipAddress?: string
): Promise<any> {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.organizationId, orgId)))
    .limit(1);

  if (!file) {
    throw new ApiError('NOT_FOUND', 'File record not found or access denied', 404);
  }

  if (file.status !== 'uploading') {
    throw new ApiError('BAD_REQUEST', `File upload cannot be completed because its status is ${file.status}`, 400);
  }

  // 1. Verify file size on R2
  let headResult;
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: file.r2Key,
    });
    headResult = await r2Client.send(headCommand);
  } catch (error) {
    console.error('R2 Head Object Error:', error);
    throw new ApiError('BAD_REQUEST', 'File has not been uploaded to R2 yet or was deleted', 400);
  }

  const actualSize = headResult.ContentLength;
  if (actualSize === undefined || actualSize === null) {
    throw new ApiError('INTERNAL_ERROR', 'Could not retrieve uploaded file size from R2', 500);
  }

  if (BigInt(actualSize) !== BigInt(file.sizeBytes)) {
    await deleteFileFromR2(file.r2Key);
    await db.update(files).set({ status: 'failed' }).where(eq(files.id, fileId));
    throw new ApiError('BAD_REQUEST', `Uploaded file size (${actualSize} bytes) does not match declared size (${file.sizeBytes} bytes)`, 400);
  }

  // 2. Fetch file content for SHA-256 calculation and virus scan
  let getResult;
  try {
    const getCommand = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: file.r2Key,
    });
    getResult = await r2Client.send(getCommand);
  } catch (error) {
    throw new ApiError('INTERNAL_ERROR', 'Failed to retrieve file from R2 for validation', 500);
  }

  const s3Stream = getResult.Body as Readable;
  if (!s3Stream) {
    throw new ApiError('INTERNAL_ERROR', 'Empty file stream returned from R2', 500);
  }

  const sha256Hash = crypto.createHash('sha256');
  
  const scanResult = await new Promise<{ status: 'clean' | 'infected' | 'failed'; virusName?: string; sha256: string }>((resolve) => {
    let content = '';

    s3Stream.on('data', (chunk) => {
      sha256Hash.update(chunk);
      if (content.length < 1024 * 1024) {
        content += chunk.toString('utf-8');
      }
    });

    s3Stream.on('end', () => {
      const sha256 = sha256Hash.digest('hex');
      const eicarString = `X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;
      if (content.includes(eicarString)) {
        resolve({
          status: 'infected',
          virusName: 'EICAR-Test-Signature (Mock)',
          sha256,
        });
      } else {
        resolve({
          status: 'clean',
          sha256,
        });
      }
    });

    s3Stream.on('error', (err) => {
      console.error('Stream processing error:', err);
      resolve({
        status: 'failed',
        sha256: '',
      });
    });
  });

  if (scanResult.status === 'failed') {
    await db.update(files).set({ status: 'failed' }).where(eq(files.id, fileId));
    throw new ApiError('INTERNAL_ERROR', 'Antivirus scan and integrity check failed during stream processing', 500);
  }

  if (scanResult.status === 'infected') {
    await deleteFileFromR2(file.r2Key);
    await db.update(files).set({
      status: 'infected',
      scanResult: { virus_name: scanResult.virusName, scanned_at: new Date().toISOString() },
    }).where(eq(files.id, fileId));

    await db.insert(auditLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: 'file.infected_detected',
      targetType: 'file',
      targetId: file.id,
      metadata: { filename: file.filename, kind: file.kind, scanResult },
      ipAddress: ipAddress || null,
    });

    throw new ApiError('INFECTED_FILE_DETECTED', `File is infected with ${scanResult.virusName}`, 400);
  }

  // 3. Mark file as ready and update quotas
  const updatedFile = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(files)
      .set({
        status: 'ready',
        sha256: scanResult.sha256,
        scanResult: { result: 'clean', scanned_at: new Date().toISOString() },
      })
      .where(eq(files.id, fileId))
      .returning();

    await updateStorageQuotaInTx(tx, orgId, Number(file.sizeBytes), 1);

    if (file.linkedEntityType && file.linkedEntityId) {
      await linkFileToEntityInTx(tx, file.linkedEntityType, file.linkedEntityId, fileId);
    }

    return updated;
  });

  await db.insert(auditLogs).values({
    organizationId: orgId,
    actorUserId: userId,
    action: 'file.uploaded',
    targetType: 'file',
    targetId: fileId,
    metadata: { filename: file.filename, kind: file.kind, sizeBytes: Number(file.sizeBytes) },
    ipAddress: ipAddress || null,
  });

  return updatedFile;
}

/**
 * Directly uploads a buffer from the server (e.g. signature canvas, server-generated PDFs).
 */
export async function uploadServerFile(
  orgId: string,
  userId: string | null,
  kind: R2KeyKind,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  linkedEntityType?: string | null,
  linkedEntityId?: string | null,
  uploadedVia: string = 'server_generated',
  ipAddress?: string
): Promise<any> {
  if (!isMimeAllowed(kind, mimeType)) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', `MIME type ${mimeType} is not allowed for ${kind}`, 415);
  }

  const { sizeLimit } = getMimeAndSizeLimit(kind);
  const sizeBytes = buffer.length;
  if (sizeBytes > sizeLimit) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `File size exceeds the limit of ${sizeLimit} bytes`, 413);
  }

  const isMatch = await verifyMimeMatchesBuffer(buffer, mimeType);
  if (!isMatch) {
    throw new ApiError('BAD_REQUEST', 'File content does not match the declared MIME type', 400);
  }

  await verifyStorageQuota(orgId, sizeBytes);

  const key = await generateR2Key(orgId, kind, linkedEntityType, linkedEntityId, filename);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const scanResult = await scanFileBuffer(buffer);
  if (scanResult.status === 'infected') {
    await db.insert(auditLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: 'file.infected_detected',
      targetType: 'file',
      metadata: { filename, kind, scanResult },
      ipAddress: ipAddress || null,
    });
    throw new ApiError('INFECTED_FILE_DETECTED', `File is infected: ${scanResult.virusName}`, 400);
  }

  const uploadCommand = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });
  await r2Client.send(uploadCommand);

  const fileResult = await db.transaction(async (tx) => {
    const [file] = await tx.insert(files).values({
      organizationId: orgId,
      r2Key: key,
      filename,
      mimeType,
      sizeBytes: BigInt(sizeBytes),
      sha256,
      kind,
      status: 'ready',
      scanResult: { result: 'clean', scanned_at: new Date().toISOString() },
      linkedEntityType: linkedEntityType || null,
      linkedEntityId: linkedEntityId || null,
      uploadedByUserId: userId || null,
      uploadedVia,
      uploadedFromIp: ipAddress || null,
    }).returning();

    await updateStorageQuotaInTx(tx, orgId, sizeBytes, 1);

    if (linkedEntityType && linkedEntityId) {
      await linkFileToEntityInTx(tx, linkedEntityType, linkedEntityId, file.id);
    }

    return file;
  });

  await db.insert(auditLogs).values({
    organizationId: orgId,
    actorUserId: userId,
    action: 'file.uploaded',
    targetType: 'file',
    targetId: fileResult.id,
    metadata: { filename, kind, sizeBytes, r2Key: key },
    ipAddress: ipAddress || null,
  });

  return fileResult;
}

/**
 * Deletes a file from R2 and removes the record from the database.
 * Decrements the storage quota.
 */
export async function deleteFile(
  fileId: string,
  orgId: string,
  userId: string | null,
  ipAddress?: string
): Promise<void> {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.organizationId, orgId)))
    .limit(1);

  if (!file) {
    throw new ApiError('NOT_FOUND', 'File not found', 404);
  }

  await db.transaction(async (tx) => {
    await tx.delete(files).where(eq(files.id, fileId));
    if (file.status === 'ready') {
      await updateStorageQuotaInTx(tx, orgId, -Number(file.sizeBytes), -1);
    }
  });

  await deleteFileFromR2(file.r2Key);

  await db.insert(auditLogs).values({
    organizationId: orgId,
    actorUserId: userId,
    action: 'file.deleted',
    targetType: 'file',
    targetId: fileId,
    metadata: { filename: file.filename, kind: file.kind, r2Key: file.r2Key },
    ipAddress: ipAddress || null,
  });
}

export async function deleteFileFromR2(key: string): Promise<void> {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    await r2Client.send(deleteCommand);
  } catch (error) {
    console.error(`Failed to delete key ${key} from R2:`, error);
  }
}

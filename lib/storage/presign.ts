import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET_NAME } from './r2-client';
import { validateTenantKey } from './r2-keys';

/**
 * Generates a presigned URL to allow a client to upload a file directly to R2.
 * Locks the Content-Type and Content-Length.
 */
export async function getPresignedPutUrl(
  key: string,
  mimeType: string,
  sizeBytes: number,
  expiresInSeconds: number = 600 // 10 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });

  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generates a presigned URL for downloading a file from R2.
 * Validates tenant isolation before generating the URL.
 */
export async function getPresignedGetUrl(
  key: string,
  orgId: string,
  expiresInSeconds: number = 300, // 5 minutes
  filename?: string
): Promise<string> {
  if (!validateTenantKey(key, orgId)) {
    throw new Error('Tenant isolation violation: Access denied to file belonging to a different organization.');
  }

  const params: any = {
    Bucket: R2_BUCKET_NAME,
    Key: key,
  };

  if (filename) {
    // Prevent XSS or headers injection by sanitizing and encoding the filename
    const sanitizedFilename = encodeURIComponent(filename.replace(/[\r\n]/g, ''));
    params.ResponseContentDisposition = `attachment; filename*=UTF-8''${sanitizedFilename}`;
  } else {
    // Default fallback to attachment
    params.ResponseContentDisposition = 'attachment';
  }

  const command = new GetObjectCommand(params);

  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

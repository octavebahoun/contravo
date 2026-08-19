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
 *
 * @param options.inline - Ask the browser to *display* the object rather than
 *   save it. This URL is what the in-app viewer points an `<iframe>` or `<img>`
 *   at: without it every link forced `attachment`, so a PDF or a signature could
 *   only ever be downloaded and opened in another application. Callers must gate
 *   it on a type known to be safe to render — see `INLINE_VIEWABLE_MIME`.
 * @param options.contentType - Pinned on the response so the browser renders the
 *   object as the type we recorded, never as one it guessed from the bytes.
 */
export async function getPresignedGetUrl(
  key: string,
  orgId: string,
  expiresInSeconds: number = 300, // 5 minutes
  filename?: string,
  options?: { inline?: boolean; contentType?: string }
): Promise<string> {
  if (!validateTenantKey(key, orgId)) {
    throw new Error('Tenant isolation violation: Access denied to file belonging to a different organization.');
  }

  const params: any = {
    Bucket: R2_BUCKET_NAME,
    Key: key,
  };

  const disposition = options?.inline ? 'inline' : 'attachment';

  if (filename) {
    // Prevent XSS or headers injection by sanitizing and encoding the filename
    const sanitizedFilename = encodeURIComponent(filename.replace(/[\r\n]/g, ''));
    params.ResponseContentDisposition = `${disposition}; filename*=UTF-8''${sanitizedFilename}`;
  } else {
    params.ResponseContentDisposition = disposition;
  }

  if (options?.contentType) {
    params.ResponseContentType = options.contentType;
  }

  const command = new GetObjectCommand(params);

  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Types the in-app viewer will render, and the only ones allowed `inline`.
 *
 * A deliberate allow-list, not a block-list. `image/svg+xml` is absent on
 * purpose: an SVG carries script, and although a presigned URL lives on R2's
 * own host rather than ours, handing a stored document a way to execute is not
 * something a document viewer needs to do.
 */
export const INLINE_VIEWABLE_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

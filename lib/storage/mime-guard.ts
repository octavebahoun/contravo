import { fileTypeFromBuffer } from 'file-type';
import { R2KeyKind } from './r2-keys';

const LIMITS: Record<R2KeyKind, number> = {
  quote_pdf: 10 * 1024 * 1024, // 10MB
  contract_pdf: 20 * 1024 * 1024, // 20MB
  contract_signed_pdf: 20 * 1024 * 1024, // 20MB
  invoice_pdf: 10 * 1024 * 1024, // 10MB
  deliverable: 500 * 1024 * 1024, // 500MB
  expense_receipt: 20 * 1024 * 1024, // 20MB
  signature_canvas: 500 * 1024, // 500KB
  attachment: 50 * 1024 * 1024, // 50MB
};

/**
 * Returns the size limit in bytes for a given file kind.
 */
export function getMimeAndSizeLimit(kind: R2KeyKind): { sizeLimit: number } {
  const limit = LIMITS[kind];
  if (limit === undefined) {
    throw new Error(`Unknown kind limit: ${kind}`);
  }
  return { sizeLimit: limit };
}

/**
 * Checks if the declared MIME type is allowed for the given file kind.
 */
export function isMimeAllowed(kind: R2KeyKind, mimeType: string): boolean {
  const mime = mimeType.toLowerCase();

  // Server-generated PDF kinds
  if (['quote_pdf', 'contract_pdf', 'contract_signed_pdf', 'invoice_pdf'].includes(kind)) {
    return mime === 'application/pdf';
  }

  // Signature canvas
  if (kind === 'signature_canvas') {
    return mime === 'image/png';
  }

  // Expense receipts
  if (kind === 'expense_receipt') {
    return [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/heic',
      'image/webp',
    ].includes(mime);
  }

  // Deliverables
  if (kind === 'deliverable') {
    if (mime === 'application/pdf') return true;
    if (mime.startsWith('image/')) return true;
    if (mime === 'video/mp4') return true;
    if (mime === 'application/zip') return true;
    
    // MS Office formats: application/vnd.openxmlformats-officedocument.*
    if (mime.startsWith('application/vnd.openxmlformats-')) return true;
    
    // OpenDocument formats: application/vnd.oasis.opendocument.*
    if (mime.startsWith('application/vnd.oasis.opendocument.')) return true;
    
    if (mime.startsWith('text/')) return true;
    
    return false;
  }

  // Generic attachments
  if (kind === 'attachment') {
    const blockedMimes = [
      'application/x-msdownload',
      'application/x-sh',
      'application/x-bash',
      'application/x-executable',
      'application/javascript',
    ];
    if (blockedMimes.includes(mime)) return false;
    return true;
  }

  return false;
}

/**
 * Validates the file buffer's magic bytes against the declared MIME type.
 * For text/JSON/CSV files that have no binary magic bytes, file-type returns undefined,
 * which we allow if the declared MIME type is text-based.
 */
export async function verifyMimeMatchesBuffer(buffer: Buffer, declaredMime: string): Promise<boolean> {
  const detected = await fileTypeFromBuffer(buffer);
  const normalizedDeclared = declaredMime.toLowerCase();

  if (!detected) {
    // If no magic bytes are detected, check if it's declared as a text/JSON/CSV/XML file
    return (
      normalizedDeclared.startsWith('text/') ||
      normalizedDeclared === 'application/json' ||
      normalizedDeclared === 'application/xml' ||
      normalizedDeclared === 'application/csv' ||
      normalizedDeclared === 'text/csv'
    );
  }

  const normalizedDetected = detected.mime.toLowerCase();
  if (normalizedDetected === normalizedDeclared) {
    return true;
  }

  // image/jpeg and image/jpg aliases
  if (
    (normalizedDetected === 'image/jpeg' && normalizedDeclared === 'image/jpg') ||
    (normalizedDetected === 'image/jpg' && normalizedDeclared === 'image/jpeg')
  ) {
    return true;
  }

  return false;
}

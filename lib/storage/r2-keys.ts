export type R2KeyKind =
  | 'quote_pdf'
  | 'contract_pdf'
  | 'contract_signed_pdf'
  | 'invoice_pdf'
  | 'deliverable'
  | 'expense_receipt'
  | 'signature_canvas'
  | 'attachment';

export function r2Key(
  orgId: string,
  kind: R2KeyKind,
  entityId: string,
  extra: string
): string {
  if (!orgId) throw new Error('orgId is required');
  if (!entityId) throw new Error('entityId is required');
  if (!extra) throw new Error('extra identifier is required');

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orgId)) {
    throw new Error('Invalid organization ID format');
  }
  if (!uuidRegex.test(entityId)) {
    throw new Error('Invalid entity ID format');
  }

  // Prevent path traversal in filename or extra inputs
  const sanitizedExtra = extra.replace(/\.\./g, '').replace(/[\/\\]/g, '_');

  switch (kind) {
    case 'quote_pdf':
      return `org/${orgId}/quotes/${entityId}/quote-${sanitizedExtra}.pdf`;
    case 'contract_pdf':
      return `org/${orgId}/contracts/${entityId}/contract-${sanitizedExtra}.pdf`;
    case 'contract_signed_pdf':
      return `org/${orgId}/contracts/${entityId}/contract-${sanitizedExtra}-signed.pdf`;
    case 'invoice_pdf':
      return `org/${orgId}/invoices/${entityId}/invoice-${sanitizedExtra}.pdf`;
    case 'deliverable':
      return `org/${orgId}/deliverables/${entityId}/${sanitizedExtra}`;
    case 'expense_receipt':
      return `org/${orgId}/expenses/${entityId}/${sanitizedExtra}`;
    case 'signature_canvas':
      return `org/${orgId}/signatures/${entityId}/${sanitizedExtra}`;
    case 'attachment':
      return `org/${orgId}/attachments/${entityId}/${sanitizedExtra}`;
    default:
      throw new Error(`Unsupported R2 key kind: ${kind}`);
  }
}

export function validateTenantKey(key: string, orgId: string): boolean {
  return key.startsWith(`org/${orgId}/`);
}

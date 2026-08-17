import { getInvoiceById, updateInvoice } from '@/lib/repositories/invoices.repo';
import { ApiError } from '@/lib/rbac';
import { emit } from '@/lib/webhooks';
import { buildEventPayload } from '@/lib/webhooks/payload-builder';


export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
export type InvoiceAction = 'send' | 'cancel' | 'refund' | 'mark_overdue';

const transitions: Record<InvoiceAction, { from: InvoiceStatus[]; to: InvoiceStatus }> = {
  send: { from: ['draft'], to: 'sent' },
  cancel: { from: ['draft', 'sent', 'overdue'], to: 'cancelled' },
  refund: { from: ['paid', 'partial'], to: 'refunded' },
  mark_overdue: { from: ['sent', 'partial'], to: 'overdue' },
};

export async function transitionInvoice(
  organizationId: string,
  invoiceId: string,
  action: InvoiceAction,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const invoice = await getInvoiceById(organizationId, invoiceId);
  if (!invoice) {
    throw new ApiError('NOT_FOUND', 'Invoice not found', 404);
  }

  const rule = transitions[action];
  if (!rule) {
    throw new ApiError('VALIDATION_ERROR', `Invalid action: ${action}`, 400);
  }

  const currentStatus = invoice.status as InvoiceStatus;
  if (!rule.from.includes(currentStatus)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Cannot apply action '${action}' to invoice in state '${currentStatus}'`,
      400
    );
  }

  const updateFields: any = { status: rule.to };

  if (action === 'send') {
    // `issue_date` is a `date` column, which drizzle maps in string mode: a Date
    // instance reaches postgres.js unserialized and makes it throw on
    // Buffer.byteLength. Sending an invoice answered 500 every single time.
    updateFields.issueDate = new Date().toISOString().split('T')[0];
  }

  const updatedInvoice = await updateInvoice(
    organizationId,
    invoiceId,
    updateFields,
    undefined,
    actorUserId,
    ipAddress
  );

  // Emit the transition event (MVP3 §6); consumed by n8n for transactional
  // emails (MVP5 §3.2). Recipient-facing transitions carry a portal link.
  const EVENT_BY_ACTION: Partial<Record<InvoiceAction, string>> = {
    send: 'invoice.sent',
    mark_overdue: 'invoice.overdue',
    refund: 'invoice.refunded',
  };

  const eventName = EVENT_BY_ACTION[action];
  if (eventName) {
    try {
      const payload = await buildEventPayload({
        organizationId,
        entityKind: 'invoice',
        entityId: invoiceId,
        entity: { ...invoice, ...updateFields },
        withPortalUrl: action === 'send' || action === 'mark_overdue',
        withPdfUrl: action === 'send',
        extra: undefined,
      });
      await emit(eventName, organizationId, payload);
    } catch (emitErr) {
      // Never fail a committed transition because a webhook could not be queued.
      console.error(`Failed to emit ${eventName} for invoice ${invoiceId}:`, emitErr);
    }
  }

  return updatedInvoice;
}

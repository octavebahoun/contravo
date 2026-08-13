import { getInvoiceById, updateInvoice } from '@/lib/repositories/invoices.repo';
import { ApiError } from '@/lib/rbac';

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
    updateFields.issueDate = new Date();
  }

  const updatedInvoice = await updateInvoice(
    organizationId,
    invoiceId,
    updateFields,
    undefined,
    actorUserId,
    ipAddress
  );

  return updatedInvoice;
}

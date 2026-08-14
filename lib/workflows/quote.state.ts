import { getQuoteById, updateQuote } from '@/lib/repositories/quotes.repo';
import { createContract } from '@/lib/repositories/contracts.repo';
import { ApiError } from '@/lib/rbac';
import { emit } from '@/lib/webhooks';
import { buildEventPayload } from '@/lib/webhooks/payload-builder';

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
export type QuoteAction = 'send' | 'view' | 'accept' | 'reject' | 'cancel' | 'expire';

const transitions: Record<QuoteAction, { from: QuoteStatus[]; to: QuoteStatus }> = {
  send: { from: ['draft'], to: 'sent' },
  view: { from: ['sent'], to: 'viewed' },
  accept: { from: ['viewed'], to: 'accepted' },
  reject: { from: ['sent', 'viewed'], to: 'rejected' },
  cancel: { from: ['sent', 'viewed'], to: 'cancelled' },
  expire: { from: ['viewed'], to: 'expired' },
};

export async function transitionQuote(
  organizationId: string,
  quoteId: string,
  action: QuoteAction,
  input?: {
    rejectionReason?: string;
    acceptedByName?: string;
    acceptedByEmail?: string;
    acceptedByIp?: string;
  },
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const quote = await getQuoteById(organizationId, quoteId);
  if (!quote) {
    throw new ApiError('NOT_FOUND', 'Quote not found', 404);
  }

  const rule = transitions[action];
  if (!rule) {
    throw new ApiError('VALIDATION_ERROR', `Invalid action: ${action}`, 400);
  }

  const currentStatus = quote.status as QuoteStatus;
  if (!rule.from.includes(currentStatus)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Cannot apply action '${action}' to quote in state '${currentStatus}'`,
      400
    );
  }

  const updateFields: any = { status: rule.to };

  if (action === 'send') {
    updateFields.sentAt = new Date();
  } else if (action === 'view') {
    updateFields.viewedAt = new Date();
  } else if (action === 'accept') {
    updateFields.acceptedAt = new Date();
    updateFields.acceptedByName = input?.acceptedByName || 'Client';
    updateFields.acceptedByEmail = input?.acceptedByEmail || '';
    updateFields.acceptedByIp = input?.acceptedByIp || ipAddress || null;
  } else if (action === 'reject') {
    updateFields.rejectedAt = new Date();
    updateFields.rejectionReason = input?.rejectionReason || null;
  }

  const updatedQuote = await updateQuote(
    organizationId,
    quoteId,
    updateFields,
    undefined,
    actorUserId,
    ipAddress
  );

  // If action is accept, automatically create a linked contract (default on)
  if (action === 'accept') {
    try {
      await createContract(
        organizationId,
        {
          projectId: quote.projectId,
          clientId: quote.clientId,
          quoteId: quote.id,
          title: `Contrat pour ${quote.number}`,
          status: 'draft',
          bodyMarkdown: `### Contrat issu du devis ${quote.number}\n\nDate d'acceptation: ${new Date().toLocaleDateString()}\nSigné par: ${updateFields.acceptedByName} (${updateFields.acceptedByEmail})`,
        },
        actorUserId,
        ipAddress
      );
    } catch (contractErr) {
      // Log error but don't fail the quote acceptance transaction if it's separate
      console.error('Failed to auto-create contract for accepted quote:', contractErr);
    }
  }

  // Emit the transition event (MVP3 §6). n8n turns these into client emails
  // (MVP5 §3.2), so `send` carries a portal link and the PDF, while internal
  // outcomes only need the team recipients.
  const EVENT_BY_ACTION: Partial<Record<QuoteAction, string>> = {
    send: 'quote.sent',
    view: 'quote.viewed',
    accept: 'quote.accepted',
    reject: 'quote.rejected',
  };

  const eventName = EVENT_BY_ACTION[action];
  if (eventName) {
    try {
      const payload = await buildEventPayload({
        organizationId,
        entityKind: 'quote',
        entityId: quoteId,
        entity: { ...quote, ...updateFields },
        withPortalUrl: action === 'send',
        withPdfUrl: action === 'send',
        extra: action === 'reject' ? { reason: input?.rejectionReason ?? null } : undefined,
      });
      await emit(eventName, organizationId, payload);
    } catch (emitErr) {
      // Never fail a committed transition because a webhook could not be queued.
      console.error(`Failed to emit ${eventName} for quote ${quoteId}:`, emitErr);
    }
  }

  return updatedQuote;
}

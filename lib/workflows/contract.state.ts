import { getContractById, updateContract } from '@/lib/repositories/contracts.repo';
import { ApiError } from '@/lib/rbac';
import { emit } from '@/lib/webhooks';
import { buildEventPayload } from '@/lib/webhooks/payload-builder';


export type ContractStatus = 'draft' | 'sent' | 'signed' | 'cancelled' | 'expired';
export type ContractAction = 'send' | 'sign' | 'cancel' | 'expire';

const transitions: Record<ContractAction, { from: ContractStatus[]; to: ContractStatus }> = {
  send: { from: ['draft'], to: 'sent' },
  sign: { from: ['sent'], to: 'signed' },
  cancel: { from: ['sent'], to: 'cancelled' },
  expire: { from: ['sent'], to: 'expired' },
};

export async function transitionContract(
  organizationId: string,
  contractId: string,
  action: ContractAction,
  input?: {
    signedByName?: string;
    signedByEmail?: string;
    signedByIp?: string;
    signatureHash?: string;
  },
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const contract = await getContractById(organizationId, contractId);
  if (!contract) {
    throw new ApiError('NOT_FOUND', 'Contract not found', 404);
  }

  const rule = transitions[action];
  if (!rule) {
    throw new ApiError('VALIDATION_ERROR', `Invalid action: ${action}`, 400);
  }

  const currentStatus = contract.status as ContractStatus;
  if (!rule.from.includes(currentStatus)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Cannot apply action '${action}' to contract in state '${currentStatus}'`,
      400
    );
  }

  const updateFields: any = { status: rule.to };

  if (action === 'send') {
    updateFields.sentAt = new Date();
  } else if (action === 'sign') {
    updateFields.signedAt = new Date();
    updateFields.signedByName = input?.signedByName || 'Client';
    updateFields.signedByEmail = input?.signedByEmail || '';
    updateFields.signedByIp = input?.signedByIp || ipAddress || null;
    updateFields.signatureHash = input?.signatureHash || 'SHA256-DUMMY-HASH';
  }

  const updatedContract = await updateContract(
    organizationId,
    contractId,
    updateFields,
    actorUserId,
    ipAddress
  );

  // Emit the transition event (MVP3 §6); consumed by n8n for transactional
  // emails (MVP5 §3.2). Recipient-facing transitions carry a portal link.
  const EVENT_BY_ACTION: Partial<Record<ContractAction, string>> = {
    send: 'contract.sent',
    sign: 'contract.signed',
  };

  const eventName = EVENT_BY_ACTION[action];
  if (eventName) {
    try {
      const payload = await buildEventPayload({
        organizationId,
        entityKind: 'contract',
        entityId: contractId,
        entity: { ...contract, ...updateFields },
        withPortalUrl: action === 'send',
        withPdfUrl: action === 'send' || action === 'sign',
        extra: undefined,
      });
      await emit(eventName, organizationId, payload);
    } catch (emitErr) {
      // Never fail a committed transition because a webhook could not be queued.
      console.error(`Failed to emit ${eventName} for contract ${contractId}:`, emitErr);
    }
  }

  return updatedContract;
}

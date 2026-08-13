import { getDeliverableById, updateDeliverable } from '@/lib/repositories/deliverables.repo';
import { ApiError } from '@/lib/rbac';

export type DeliverableStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';
export type DeliverableAction = 'submit' | 'approve' | 'reject' | 'request_revision';

const transitions: Record<DeliverableAction, { from: DeliverableStatus[]; to: DeliverableStatus }> = {
  submit: { from: ['draft'], to: 'submitted' },
  approve: { from: ['submitted'], to: 'approved' },
  reject: { from: ['submitted'], to: 'rejected' },
  request_revision: { from: ['submitted'], to: 'revision_requested' },
};

export async function transitionDeliverable(
  organizationId: string,
  deliverableId: string,
  action: DeliverableAction,
  input?: {
    rejectionReason?: string;
    reviewedByName?: string;
    reviewedByEmail?: string;
    reviewedByIp?: string;
  },
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const deliverable = await getDeliverableById(organizationId, deliverableId);
  if (!deliverable) {
    throw new ApiError('NOT_FOUND', 'Deliverable not found', 404);
  }

  const rule = transitions[action];
  if (!rule) {
    throw new ApiError('VALIDATION_ERROR', `Invalid action: ${action}`, 400);
  }

  const currentStatus = deliverable.status as DeliverableStatus;
  if (!rule.from.includes(currentStatus)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Cannot apply action '${action}' to deliverable in state '${currentStatus}'`,
      400
    );
  }

  const updateFields: any = { status: rule.to };

  if (action === 'submit') {
    updateFields.submittedAt = new Date();
  } else if (action === 'approve') {
    updateFields.reviewedAt = new Date();
    updateFields.reviewedByName = input?.reviewedByName || 'Client';
    updateFields.reviewedByEmail = input?.reviewedByEmail || '';
    updateFields.reviewedByIp = input?.reviewedByIp || ipAddress || null;
  } else if (action === 'reject') {
    updateFields.reviewedAt = new Date();
    updateFields.reviewedByName = input?.reviewedByName || 'Client';
    updateFields.reviewedByEmail = input?.reviewedByEmail || '';
    updateFields.reviewedByIp = input?.reviewedByIp || ipAddress || null;
    updateFields.rejectionReason = input?.rejectionReason || null;
  } else if (action === 'request_revision') {
    updateFields.reviewedAt = new Date();
    updateFields.reviewedByName = input?.reviewedByName || 'Client';
    updateFields.reviewedByEmail = input?.reviewedByEmail || '';
    updateFields.reviewedByIp = input?.reviewedByIp || ipAddress || null;
    updateFields.rejectionReason = input?.rejectionReason || null; // standard comment or reason
  }

  const updatedDeliverable = await updateDeliverable(
    organizationId,
    deliverableId,
    updateFields,
    actorUserId,
    ipAddress
  );

  return updatedDeliverable;
}

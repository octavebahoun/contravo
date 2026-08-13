import { getProjectById, updateProject } from '@/lib/repositories/projects.repo';
import { ApiError } from '@/lib/rbac';

export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'delivered' | 'cancelled' | 'archived';
export type ProjectAction = 'activate' | 'hold' | 'resume' | 'deliver' | 'cancel' | 'archive';

const transitions: Record<ProjectAction, { from: ProjectStatus[]; to: ProjectStatus }> = {
  activate: { from: ['draft'], to: 'active' },
  hold: { from: ['active'], to: 'on_hold' },
  resume: { from: ['on_hold'], to: 'active' },
  deliver: { from: ['active'], to: 'delivered' },
  cancel: { from: ['active'], to: 'cancelled' },
  archive: { from: ['active', 'delivered'], to: 'archived' },
};

export async function transitionProject(
  organizationId: string,
  projectId: string,
  action: ProjectAction,
  actorUserId?: string | null,
  ipAddress?: string | null
) {
  const project = await getProjectById(organizationId, projectId);
  if (!project) {
    throw new ApiError('NOT_FOUND', 'Project not found', 404);
  }

  const rule = transitions[action];
  if (!rule) {
    throw new ApiError('VALIDATION_ERROR', `Invalid action: ${action}`, 400);
  }

  const currentStatus = project.status as ProjectStatus;
  if (!rule.from.includes(currentStatus)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Cannot apply action '${action}' to project in state '${currentStatus}'`,
      400
    );
  }

  const updatedProject = await updateProject(
    organizationId,
    projectId,
    { status: rule.to },
    actorUserId,
    ipAddress
  );

  return updatedProject;
}

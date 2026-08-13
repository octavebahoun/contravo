import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { transitionProject, ProjectStatus, ProjectAction } from '@/lib/workflows/project.state';
import { getProjectById } from '@/lib/repositories/projects.repo';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const transitionSchema = z.object({
  to: z.enum(['draft', 'active', 'on_hold', 'delivered', 'cancelled', 'archived']),
});

const statusToActionMap: Record<string, Record<string, ProjectAction>> = {
  draft: { active: 'activate' },
  active: { on_hold: 'hold', delivered: 'deliver', cancelled: 'cancel', archived: 'archive' },
  on_hold: { active: 'resume' },
  delivered: { archived: 'archive' },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:write');

    const body = await request.json();
    const { to } = transitionSchema.parse(body);

    const project = await getProjectById(ctx.organizationId, id);
    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found', 404);
    }

    const currentStatus = project.status as ProjectStatus;
    if (currentStatus === to) {
      return NextResponse.json({
        ...project,
        budgetCents: project.budgetCents?.toString() || null,
      });
    }

    const action = statusToActionMap[currentStatus]?.[to];
    if (!action) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `No transition path from '${currentStatus}' to '${to}'`,
        400
      );
    }

    const updatedProject = await transitionProject(
      ctx.organizationId,
      id,
      action,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    return NextResponse.json({
      ...updatedProject,
      budgetCents: updatedProject.budgetCents?.toString() || null,
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

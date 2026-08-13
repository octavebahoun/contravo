import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getProjectById, updateProject, deleteProject } from '@/lib/repositories/projects.repo';
import { formatErrorResponse } from '@/lib/errors';
import { ApiError } from '@/lib/rbac';
import { z } from 'zod';

const updateProjectSchema = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['draft', 'active', 'on_hold', 'delivered', 'cancelled', 'archived']).optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  budgetCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))).optional().nullable(),
  currency: z.string().optional(),
  ownerUserId: z.string().uuid().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:read');

    const project = await getProjectById(ctx.organizationId, id);
    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found', 404);
    }

    const serializedProject = {
      ...project,
      budgetCents: project.budgetCents?.toString() || null,
    };

    return NextResponse.json(serializedProject);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:write');

    const body = await request.json();
    const validated = updateProjectSchema.parse(body);

    const project = await updateProject(
      ctx.organizationId,
      id,
      validated,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedProject = {
      ...project,
      budgetCents: project.budgetCents?.toString() || null,
    };

    return NextResponse.json(serializedProject);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    // Enforce projects:delete scope to prevent members from deleting
    checkScope(ctx, 'projects:delete');

    const project = await deleteProject(
      ctx.organizationId,
      id,
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedProject = {
      ...project,
      budgetCents: project.budgetCents?.toString() || null,
    };

    return NextResponse.json(serializedProject);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

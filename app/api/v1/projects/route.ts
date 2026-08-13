import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { createProject, listProjects } from '@/lib/repositories/projects.repo';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const createProjectSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(['draft', 'active', 'on_hold', 'delivered', 'cancelled', 'archived']).default('draft'),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  budgetCents: z.string().transform((val) => BigInt(val)).or(z.number().transform((val) => BigInt(val))).optional().nullable(),
  currency: z.string().default('XOF'),
  ownerUserId: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:read');

    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || undefined;
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const projectsList = await listProjects(ctx.organizationId, {
      clientId,
      status,
      page,
      limit,
    });

    // Handle BigInt serialization by converting to strings where necessary
    const serializedProjects = projectsList.map((p) => ({
      ...p,
      budgetCents: p.budgetCents?.toString() || null,
    }));

    return NextResponse.json({ projects: serializedProjects });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'projects:write');

    const body = await request.json();
    const validated = createProjectSchema.parse(body);

    const project = await createProject(
      ctx.organizationId,
      {
        ...validated,
        budgetCents: validated.budgetCents || null,
      },
      ctx.userId,
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
    );

    const serializedProject = {
      ...project,
      budgetCents: project.budgetCents?.toString() || null,
    };

    return NextResponse.json(serializedProject, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

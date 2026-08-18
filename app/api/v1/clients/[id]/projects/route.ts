import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { listProjects, serializeProject } from '@/lib/repositories/projects.repo';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'clients:read');

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const clientProjects = await listProjects(ctx.organizationId, {
      clientId: id,
      page,
      limit,
    });

    return NextResponse.json({ projects: clientProjects.map(serializeProject) });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

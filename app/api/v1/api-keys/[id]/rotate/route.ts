import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { rotateApiKey } from '@/lib/api-keys';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'api_keys:write');

    const { id } = await params;
    const newKey = await rotateApiKey(id, ctx.organizationId, ctx.userId);

    return NextResponse.json(newKey);
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}

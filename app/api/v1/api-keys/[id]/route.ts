import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { revokeApiKey } from '@/lib/api-keys';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'api_keys:write');

    const { id } = await params;
    await revokeApiKey(id, ctx.organizationId);

    return NextResponse.json({ success: true, message: 'API key revoked' });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}

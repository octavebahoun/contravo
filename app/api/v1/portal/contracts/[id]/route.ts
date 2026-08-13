import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/auth/unified-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getApiContext();

    if (ctx.authType !== 'public_token') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Only public token access allowed' },
        { status: 403 }
      );
    }

    if (!ctx.scopes.includes('read') && !ctx.scopes.includes('*')) {
      return NextResponse.json(
        { error: 'permission_denied', message: 'Missing required scope: read' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Return a mock contract matching the resource ID
    return NextResponse.json({
      contract: {
        id,
        organizationId: ctx.organizationId,
        title: 'Mock Contract',
        status: 'draft',
        recipientEmail: ctx.recipientEmail,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'internal_server_error';
    return NextResponse.json(
      { error: code, message: err?.message || 'Unexpected error' },
      { status }
    );
  }
}

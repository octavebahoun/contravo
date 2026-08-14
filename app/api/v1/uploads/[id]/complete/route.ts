import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { completeUpload } from '@/lib/storage/upload-service';
import { formatErrorResponse } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'files:write');

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const file = await completeUpload(
      id,
      ctx.organizationId,
      ctx.userId || null,
      ipAddress
    );

    // Drizzle bigint column maps to BigInt in JS, which JSON.stringify cannot serialize.
    // Convert sizeBytes to string for safe JSON serialization.
    const serializedFile = {
      ...file,
      sizeBytes: file.sizeBytes ? String(file.sizeBytes) : '0',
    };

    return NextResponse.json(serializedFile);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

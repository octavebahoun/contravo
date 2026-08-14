import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { deleteFile } from '@/lib/storage/upload-service';
import { db } from '@/lib/db/drizzle';
import { files } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'files:read');

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.organizationId, ctx.organizationId)))
      .limit(1);

    if (!file) {
      throw new ApiError('NOT_FOUND', 'File not found', 404);
    }

    const serializedFile = {
      ...file,
      sizeBytes: file.sizeBytes ? String(file.sizeBytes) : '0',
    };

    return NextResponse.json(serializedFile);
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
    // Enforce files:delete permission
    checkScope(ctx, 'files:delete');

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    await deleteFile(id, ctx.organizationId, ctx.userId || null, ipAddress);

    return NextResponse.json({ success: true });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

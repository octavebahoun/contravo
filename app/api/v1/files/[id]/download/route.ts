import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { getPresignedGetUrl } from '@/lib/storage/presign';
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

    // 1. Fetch file record from DB
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.organizationId, ctx.organizationId)))
      .limit(1);

    if (!file) {
      throw new ApiError('NOT_FOUND', 'File not found or access denied', 404);
    }

    if (file.status !== 'ready') {
      throw new ApiError('BAD_REQUEST', `File is not ready for download (current status: ${file.status})`, 400);
    }

    // 2. Determine expiration time
    const searchParams = request.nextUrl.searchParams;
    const expiresInParam = searchParams.get('expiresIn');
    
    // Default duration depending on the file kind (1h for printables, 5min for others)
    const isPrintable = ['invoice_pdf', 'contract_pdf', 'contract_signed_pdf', 'quote_pdf'].includes(file.kind);
    let expiresIn = isPrintable ? 3600 : 300;

    if (expiresInParam) {
      const parsed = parseInt(expiresInParam, 10);
      if (!isNaN(parsed)) {
        // Clamp between 30 seconds and 24 hours
        expiresIn = Math.max(30, Math.min(parsed, 86400));
      }
    }

    // 3. Generate presigned GET URL
    const downloadUrl = await getPresignedGetUrl(
      file.r2Key,
      ctx.organizationId,
      expiresIn,
      file.filename
    );

    return NextResponse.json({
      downloadUrl,
      expiresIn,
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

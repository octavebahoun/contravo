import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import { db } from '@/lib/db/drizzle';
import { files, users } from '@/lib/db/schema';
import { eq, and, desc, ilike, sql } from 'drizzle-orm';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Organization-wide file listing.
 *
 * `/api/v1/files/[id]` and the upload routes already existed, but nothing could
 * enumerate them — so the documents an organization stores were unreachable
 * from the interface.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getApiContext();
    checkScope(ctx, 'files:read');

    const searchParams = request.nextUrl.searchParams;
    const kind = searchParams.get('kind') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const conditions = [eq(files.organizationId, ctx.organizationId)];
    if (kind) conditions.push(eq(files.kind, kind));
    if (status) conditions.push(eq(files.status, status));
    if (search) conditions.push(ilike(files.filename, `%${search}%`));

    const where = and(...conditions);

    const rows = await db
      .select({
        id: files.id,
        filename: files.filename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        kind: files.kind,
        status: files.status,
        linkedEntityType: files.linkedEntityType,
        linkedEntityId: files.linkedEntityId,
        uploadedVia: files.uploadedVia,
        createdAt: files.createdAt,
        uploadedByName: users.fullName,
      })
      .from(files)
      .leftJoin(users, eq(users.id, files.uploadedByUserId))
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [totals] = await db
      .select({
        count: sql<number>`count(*)::int`,
        // Summed in SQL rather than over the page, so the storage figure
        // reflects the whole organization and not just the rows returned.
        totalBytes: sql<string>`coalesce(sum(size_bytes), 0)::text`,
      })
      .from(files)
      .where(where);

    return NextResponse.json({
      files: rows.map((row) => ({
        ...row,
        // `bigint` columns cannot cross JSON.stringify; decimal strings keep
        // the exact value the way the rest of the API does.
        sizeBytes: String(row.sizeBytes ?? 0),
      })),
      pagination: {
        page,
        limit,
        total: totals?.count ?? 0,
      },
      totalBytes: totals?.totalBytes ?? '0',
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}

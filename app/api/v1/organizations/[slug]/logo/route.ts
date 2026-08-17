import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/lib/db/drizzle';
import { files, organizations } from '@/lib/db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { r2Client, R2_BUCKET_NAME } from '@/lib/storage/r2-client';
import { rateLimitIp } from '@/lib/rate-limit';
import { requireOrg, requirePermission, ApiError } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/**
 * Public organization logo.
 *
 * Deliberately unauthenticated: this URL is embedded in transactional emails, so
 * it is fetched by mail clients that carry no session and no API key. A presigned
 * R2 link cannot serve this purpose — it expires within the hour, and a client
 * reading their quote three days later would see a broken image. A logo is not a
 * secret, so a stable public URL is the right trade.
 *
 * The route is narrow on purpose: it serves only the file the organization has
 * declared as `logo_file_id`, and only if that file is a ready image belonging to
 * that same organization. Without those checks it would become a way to read any
 * object in the bucket by id.
 *
 * It lives under `[slug]` because Next.js rejects two different dynamic segment
 * names at the same path level, and accepts either the uuid or the slug.
 */

/** Images an organization may use as a logo, and that mail clients render. */
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () =>
  NextResponse.json({ error: 'not_found', message: 'No logo set' }, { status: 404 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // No credential gates this route, so the IP budget is the only thing standing
  // between it and being used as a bandwidth relay.
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const rateLimitResult = await rateLimitIp(ip, 300);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'Too many requests' },
      { status: 429 }
    );
  }

  const identifier = UUID_PATTERN.test(slug)
    ? or(eq(organizations.id, slug), eq(organizations.slug, slug))
    : eq(organizations.slug, slug);

  const [organization] = await db
    .select({ id: organizations.id, logoFileId: organizations.logoFileId })
    .from(organizations)
    .where(and(identifier, isNull(organizations.deletedAt)))
    .limit(1);

  if (!organization?.logoFileId) {
    return notFound();
  }

  const [file] = await db
    .select({
      r2Key: files.r2Key,
      mimeType: files.mimeType,
      organizationId: files.organizationId,
      status: files.status,
    })
    .from(files)
    .where(eq(files.id, organization.logoFileId))
    .limit(1);

  // The file must belong to this organization: `logo_file_id` is written through
  // the API, and a stale or tampered value must not read another tenant's object.
  if (
    !file ||
    file.organizationId !== organization.id ||
    file.status !== 'ready' ||
    !ALLOWED_MIME.has(file.mimeType.toLowerCase())
  ) {
    return notFound();
  }

  let object;
  try {
    object = await r2Client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: file.r2Key })
    );
  } catch {
    return notFound();
  }

  const body = await object.Body?.transformToByteArray();
  if (!body) {
    return notFound();
  }

  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(body.byteLength),
      // Long-lived: the URL is stable and a logo rarely changes. Replacing the
      // logo writes a new `logo_file_id`, and callers that need it immediately
      // can bust the cache with a query string.
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      // The bucket holds tenant data; never let a response be sniffed into
      // something executable.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}

const setLogoSchema = z.object({
  /** Id of an already-uploaded file, obtained from the presign/complete flow. */
  fileId: z.string().uuid(),
}).strict();

/**
 * Declares an uploaded image as the organization's logo.
 *
 * Kept here rather than widening `PATCH /organizations/[slug]`, which only
 * accepts a name: the file has to be validated against this organization before
 * the public GET above will serve it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.update');

    const body = await request.json();
    const { fileId } = setLogoSchema.parse(body);

    const [file] = await db
      .select({
        id: files.id,
        mimeType: files.mimeType,
        status: files.status,
      })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.organizationId, context.organization.id)))
      .limit(1);

    if (!file) {
      throw new ApiError('NOT_FOUND', 'Fichier introuvable', 404);
    }

    if (file.status !== 'ready') {
      throw new ApiError(
        'BAD_REQUEST',
        `Le fichier n'est pas encore disponible (statut : ${file.status})`,
        400
      );
    }

    if (!ALLOWED_MIME.has(file.mimeType.toLowerCase())) {
      throw new ApiError(
        'UNSUPPORTED_MEDIA_TYPE',
        'Le logo doit être une image PNG, JPEG, WebP ou GIF',
        415
      );
    }

    await db
      .update(organizations)
      .set({ logoFileId: file.id, updatedAt: new Date() })
      .where(eq(organizations.id, context.organization.id));

    await context.audit('organization.logo.update', { fileId: file.id });

    return NextResponse.json({
      logoFileId: file.id,
      logoUrl: `/api/v1/organizations/${context.organization.id}/logo`,
    });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

/** Removes the logo. The underlying file is left in place, only the link is cut. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.update');

    await db
      .update(organizations)
      .set({ logoFileId: null, updatedAt: new Date() })
      .where(eq(organizations.id, context.organization.id));

    await context.audit('organization.logo.delete', {});

    return NextResponse.json({ success: true });
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

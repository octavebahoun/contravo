import { NextRequest, NextResponse } from 'next/server';
import { getApiContext, checkScope } from '@/lib/auth/unified-auth';
import {
  deleteWebhookEndpoint,
  serializeWebhookEndpoint,
  updateWebhookEndpoint,
} from '@/lib/webhooks';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

/** One outbound webhook endpoint: edit its URL / subscription, or remove it. */

const updateSchema = z
  .object({
    url: z.string().url().optional(),
    events: z.array(z.string().min(1)).min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Aucun champ à modifier.',
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getApiContext();
    checkScope(ctx, 'webhooks:manage');

    const body = await request.json().catch(() => ({}));
    const input = updateSchema.parse(body);

    const endpoint = await updateWebhookEndpoint(id, ctx.organizationId, input);

    return NextResponse.json(serializeWebhookEndpoint(endpoint));
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
    checkScope(ctx, 'webhooks:manage');

    const endpoint = await deleteWebhookEndpoint(id, ctx.organizationId);

    return NextResponse.json(serializeWebhookEndpoint(endpoint));
  } catch (err) {
    return formatErrorResponse(err);
  }
}

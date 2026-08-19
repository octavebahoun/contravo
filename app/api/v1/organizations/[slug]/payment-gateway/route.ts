import { NextRequest, NextResponse } from 'next/server';
import { requireOrg, requirePermission } from '@/lib/rbac';
import { formatErrorResponse } from '@/lib/errors';
import {
  connectGateway,
  disconnectGateway,
  getGatewayStatus,
} from '@/lib/payments/gateway-connect.service';
import { z } from 'zod';

/**
 * The organization's own GeniusPay account (MVP3 §5).
 *
 * Reserved to owners and admins through `org.update`: these keys let anyone
 * holding them collect money in the organization's name, and the secret is
 * write-only — `GET` returns a masked public key and never anything else.
 */

const connectSchema = z
  .object({
    apiKeyPublic: z.string().trim().min(10, 'Clé publique manquante'),
    apiSecret: z.string().trim().min(10, 'Clé secrète manquante'),
    webhookSecret: z.string().trim().min(10, 'Secret webhook manquant'),
  })
  .strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.update');

    return NextResponse.json(await getGatewayStatus(context.organization.id));
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.update');

    const validated = connectSchema.parse(await request.json());

    const status = await connectGateway({
      organizationId: context.organization.id,
      userId: context.user.id,
      ...validated,
    });

    // Deliberately records the environment and the merchant, never the keys.
    await context.audit('payment_gateway.connect', {
      provider: 'geniuspay',
      environment: status.environment,
      merchantId: status.merchantId,
    });

    return NextResponse.json(status);
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = request.headers.get('x-request-id') || undefined;
  try {
    const { slug } = await params;
    const context = await requireOrg(slug);
    requirePermission(context, 'org.update');

    const status = await disconnectGateway(context.organization.id);
    await context.audit('payment_gateway.disconnect', { provider: 'geniuspay' });

    return NextResponse.json(status);
  } catch (error) {
    return formatErrorResponse(error, requestId);
  }
}

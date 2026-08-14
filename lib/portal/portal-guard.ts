import { NextResponse } from 'next/server';
import { getApiContext, type ApiRequestContext } from '@/lib/auth/unified-auth';
import { ApiError } from '@/lib/rbac';

/**
 * Shared access check for the public client portal (MVP2 §3).
 *
 * Every portal route answers a link the client received by email, authenticated
 * by a public token rather than a session or API key.
 *
 * The token/resource binding is already enforced upstream: the middleware calls
 * `verifyPublicToken(token, resourceType, resourceId)` with the id parsed from
 * the URL, so a token minted for quote A cannot read quote B. What remains here
 * is the auth channel and the granted action.
 *
 * @param action - Portal action the route requires, e.g. `read` or `sign`.
 */
export async function requirePortalAccess(action: string): Promise<ApiRequestContext> {
  const ctx = await getApiContext();

  if (ctx.authType !== 'public_token') {
    throw new ApiError('PERMISSION_DENIED', 'Only public token access allowed', 403);
  }

  if (!ctx.scopes.includes(action) && !ctx.scopes.includes('*')) {
    throw new ApiError('PERMISSION_DENIED', `Missing required scope: ${action}`, 403);
  }

  return ctx;
}

/** Fields the portal may expose about the issuing organization. */
export type PortalOrg = {
  name: string;
  brandColor: string;
  logoUrl: string | null;
};

/**
 * Formats a cents amount for display in the portal.
 *
 * @param cents - Amount in minor units, as bigint or number.
 */
export function formatPortalAmount(cents: bigint | number, currency: string): string {
  const value = Number(cents) / 100;
  const [units, decimals] = value.toFixed(2).split('.');
  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${decimals} ${currency}`;
}

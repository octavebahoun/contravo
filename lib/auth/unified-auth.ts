import { headers } from 'next/headers';
import { ApiError } from '@/lib/rbac';
import { tenantDb } from '@/lib/db/tenant-db';

export type ApiRequestContext = {
  organizationId: string;
  authType: 'session' | 'api_key' | 'public_token';
  db: ReturnType<typeof tenantDb>;
  scopes: string[];
  userId?: string;
  role?: string; // only for session
  apiKeyId?: string; // only for api_key
  publicTokenId?: string; // only for public_token
  recipientEmail?: string; // only for public_token
};

export async function getApiContext(): Promise<ApiRequestContext> {
  const headersList = await headers();
  const organizationId = headersList.get('x-organization-id');
  const authType = headersList.get('x-auth-type') as 'session' | 'api_key' | 'public_token' | null;

  if (!organizationId || !authType) {
    throw new ApiError('UNAUTHENTICATED', 'Authentication required', 401);
  }

  const scopesStr = headersList.get('x-auth-scopes');
  let scopes: string[] = [];
  if (scopesStr) {
    try {
      scopes = JSON.parse(scopesStr);
    } catch {
      scopes = [];
    }
  }

  return {
    organizationId,
    authType,
    db: tenantDb(organizationId),
    scopes,
    userId: headersList.get('x-user-id') || undefined,
    role: headersList.get('x-auth-role') || undefined,
    apiKeyId: headersList.get('x-api-key-id') || undefined,
    publicTokenId: headersList.get('x-public-token-id') || undefined,
    recipientEmail: headersList.get('x-recipient-email') || undefined,
  };
}

export function checkScope(context: ApiRequestContext, requiredScope: string): void {
  // If it's session-based, check roles or permissions.
  if (context.authType === 'session') {
    if (context.role === 'owner' || context.role === 'admin') {
      return;
    }
    // Simple mapping: if they are viewer, they can only do read scopes
    if (context.role === 'viewer') {
      if (
        requiredScope.endsWith(':read') ||
        requiredScope.endsWith(':view') ||
        requiredScope.endsWith(':list') ||
        requiredScope.includes('read')
      ) {
        return;
      }
      throw new ApiError('PERMISSION_DENIED', 'Insufficient permissions (viewer)', 403);
    }
    // Members can do normal actions, but check if we want to restrict delete for members
    if (context.role === 'member') {
      if (requiredScope.endsWith(':delete')) {
        throw new ApiError('PERMISSION_DENIED', 'Members cannot delete resources', 403);
      }
      return;
    }
    return;
  }

  // For API keys or public tokens, check granular scopes
  if (!context.scopes.includes(requiredScope) && !context.scopes.includes('*')) {
    throw new ApiError('PERMISSION_DENIED', `Missing required scope: ${requiredScope}`, 403);
  }
}

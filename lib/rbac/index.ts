import { db } from '@/lib/db/drizzle';
import { organizations, memberships } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { tenantDb } from '@/lib/db/tenant-db';
import { createAuditLog } from '@/lib/audit';
import { ROLES, PERMISSIONS, Permission, Role } from './roles';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details: any;

  constructor(code: string, message: string, statusCode = 400, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type RequestContext = {
  user: { id: string; email: string; fullName: string };
  organization: { id: string; slug: string; name: string; role: Role };
  db: ReturnType<typeof tenantDb>;
  audit: (action: string, meta?: any) => Promise<void>;
};

/** Un uuid, par opposition à un slug. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Résout l'organisation d'une route `[slug]`, par son slug **ou** par son id.
 *
 * Le segment s'appelle `slug`, mais l'identifiant que le tableau de bord a sous
 * la main est l'id : `/api/team` renvoie la ligne de l'organisation, et
 * l'envoi de logo appelait `POST /organizations/<uuid>/logo`. Résolue par slug
 * seul, cette requête ne trouvait rien et repartait en 403 — **le fichier
 * arrivait bien dans R2, mais `logo_file_id` n'était jamais écrit**, si bien que
 * le logo restait invisible tout en étant téléchargeable depuis Fichiers.
 *
 * Le GET public du logo acceptait déjà les deux formes ; les faire diverger
 * était précisément le piège.
 */
export async function requireOrg(orgSlugOrId: string, ipAddress?: string): Promise<RequestContext> {
  const user = await getSession();
  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 'You must be signed in to perform this action', 401);
  }

  const identifier = UUID_PATTERN.test(orgSlugOrId)
    ? or(eq(organizations.id, orgSlugOrId), eq(organizations.slug, orgSlugOrId))
    : eq(organizations.slug, orgSlugOrId);

  const result = await db
    .select({
      organization: organizations,
      membership: memberships,
    })
    .from(organizations)
    .innerJoin(memberships, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        identifier,
        eq(memberships.userId, user.id)
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new ApiError('PERMISSION_DENIED', 'You do not have access to this organization', 403);
  }

  const { organization, membership } = result[0];

  const contextDb = tenantDb(organization.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: membership.role as Role,
    },
    db: contextDb,
    audit: async (action: string, meta?: any) => {
      await createAuditLog({
        organizationId: organization.id,
        actorUserId: user.id,
        action,
        ipAddress: ipAddress || null,
        metadata: meta,
      });
    },
  };
}

export function requirePermission(context: RequestContext, permission: Permission) {
  const role = context.organization.role;
  const allowedRoles = PERMISSIONS[permission];
  
  if (!allowedRoles || !allowedRoles.includes(role as any)) {
    throw new ApiError(
      'PERMISSION_DENIED',
      `You do not have permission to perform this action`,
      403,
      { requiredRoles: allowedRoles }
    );
  }
}
export { ROLES, PERMISSIONS };
export type { Permission, Role };

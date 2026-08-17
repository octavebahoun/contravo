import { db } from '@/lib/db/drizzle';
import { clients, memberships, organizations, users } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { generatePublicToken } from '@/lib/public-tokens';

/**
 * Builds the `data` payload carried by outbound webhook events (MVP3 §6).
 *
 * n8n consumes these events to send transactional emails (MVP5 §3.2) and reads a
 * fixed set of fields — client, org, number, portalUrl, pdfUrl, teamEmails — so
 * they are assembled here once instead of being re-derived at each call site.
 *
 * Everything is best-effort: a webhook payload must never be the reason a state
 * transition fails, so enrichment errors degrade to a smaller payload.
 */

export type EntityKind = 'quote' | 'contract' | 'invoice' | 'deliverable' | 'review_request';

/** Portal actions granted by the token minted for the recipient. */
const PORTAL_ACTIONS: Record<EntityKind, string[]> = {
  quote: ['read', 'sign'],
  contract: ['read', 'sign'],
  invoice: ['read', 'pay'],
  deliverable: ['read', 'approve', 'reject'],
  review_request: ['read', 'submit_review'],
};

/** Portal path segment per entity, matching app/api/v1/portal/*. */
const PORTAL_PATH: Record<EntityKind, string> = {
  quote: 'quotes',
  contract: 'contracts',
  invoice: 'invoices',
  deliverable: 'deliverables',
  review_request: 'reviews',
};

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || 'http://localhost:3000';
}

/**
 * Returns the emails of members who should be notified internally.
 *
 * Restricted to owners and admins: MVP5 §3.2 routes team notifications to
 * decision makers, not to every member of the organization.
 */
async function loadTeamEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        inArray(memberships.role, ['owner', 'admin'])
      )
    );

  return rows.map((r) => r.email).filter(Boolean);
}

export type BuildPayloadParams = {
  organizationId: string;
  entityKind: EntityKind;
  entityId: string;
  /** Entity row; `number`, `title` and `totalCents` are used when present. */
  entity: Record<string, any>;
  /** Mint a portal token and expose `portalUrl` (recipient-facing emails). */
  withPortalUrl?: boolean;
  /** Expose a `pdfUrl` the n8n workflow can download and attach. */
  withPdfUrl?: boolean;
  /** Extra fields merged last, e.g. `{ reason }` or `{ rating }`. */
  extra?: Record<string, unknown>;
};

/**
 * Assembles the event `data` object.
 *
 * @returns Payload shaped for the n8n email templates; enrichment that fails is
 *   simply omitted rather than thrown.
 */
export async function buildEventPayload(
  params: BuildPayloadParams
): Promise<Record<string, unknown>> {
  const { organizationId, entityKind, entityId, entity, extra } = params;

  const payload: Record<string, unknown> = {
    id: entityId,
    [`${entityKind}Id`]: entityId,
    number: entity.number ?? null,
    title: entity.title ?? null,
    status: entity.status ?? null,
  };

  if (entity.totalCents !== undefined && entity.totalCents !== null) {
    // Decimal string, like the API returns for the same column and like
    // `toJsonSafe` produces for the raw rows other call sites emit. `Number()`
    // here made the field's type depend on which code path built the event.
    payload.totalCents = String(entity.totalCents);
    payload.currency = entity.currency ?? null;
  }

  try {
    const [org] = await db
      .select({
        name: organizations.name,
        brandColor: organizations.brandColor,
        logoFileId: organizations.logoFileId,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org) {
      payload.org = { name: org.name, brandColor: org.brandColor ?? '#2B6CE5' };
    }

    payload.teamEmails = await loadTeamEmails(organizationId);
    payload.ownerEmail = (payload.teamEmails as string[])[0] ?? null;

    let recipientEmail: string | null = null;

    if (entity.clientId) {
      const [client] = await db
        .select({
          displayName: clients.displayName,
          email: clients.email,
        })
        .from(clients)
        .where(and(eq(clients.id, entity.clientId), eq(clients.organizationId, organizationId)))
        .limit(1);

      if (client) {
        recipientEmail = client.email;
        payload.client = { name: client.displayName, email: client.email };
        payload.clientName = client.displayName;
      }
    }

    if (params.withPortalUrl && recipientEmail) {
      const token = await generatePublicToken({
        organizationId,
        resourceType: entityKind,
        resourceId: entityId,
        recipientEmail,
        actions: PORTAL_ACTIONS[entityKind],
      });

      payload.portalUrl = `${baseUrl()}/portal/${PORTAL_PATH[entityKind]}/${entityId}?token=${token.token}`;
    }

    if (params.withPdfUrl) {
      // n8n follows this with its API key; the server answers a 302 to a
      // short-lived presigned R2 URL (MVP4 §8.2).
      const path = entityKind === 'quote' ? 'quotes' : entityKind === 'invoice' ? 'invoices' : 'contracts';
      payload.pdfUrl = `${baseUrl()}/api/v1/${path}/${entityId}/pdf/download`;
    }
  } catch (error) {
    // A webhook payload is never worth failing a business transition for.
    console.error('buildEventPayload: enrichment failed', error);
  }

  return { ...payload, ...(extra ?? {}) };
}

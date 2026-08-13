import { db } from '@/lib/db/drizzle';
import { auditLogs } from '@/lib/db/schema';

export async function createAuditLog(params: {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, any>;
  ipAddress?: string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      organizationId: params.organizationId || null,
      actorUserId: params.actorUserId || null,
      action: params.action,
      targetType: params.targetType || null,
      targetId: params.targetId || null,
      metadata: params.metadata || {},
      ipAddress: params.ipAddress || null,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

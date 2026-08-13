import { db } from './drizzle';
import { eq, and } from 'drizzle-orm';

export function tenantDb(organizationId: string) {
  return {
    select: (table: any, condition?: any) => {
      const baseQuery = db.select().from(table);
      const tenantCondition = eq(table.organizationId, organizationId);
      const finalCondition = condition ? and(tenantCondition, condition) : tenantCondition;
      return baseQuery.where(finalCondition);
    },
    insert: (table: any, values: any) => {
      if (Array.isArray(values)) {
        return db.insert(table).values(
          values.map((v: any) => ({ ...v, organizationId }))
        );
      }
      return db.insert(table).values({ ...values, organizationId });
    },
    update: (table: any, values: any, condition?: any) => {
      const tenantCondition = eq(table.organizationId, organizationId);
      const finalCondition = condition ? and(tenantCondition, condition) : tenantCondition;
      return db.update(table).set(values).where(finalCondition);
    },
    delete: (table: any, condition?: any) => {
      const tenantCondition = eq(table.organizationId, organizationId);
      const finalCondition = condition ? and(tenantCondition, condition) : tenantCondition;
      return db.delete(table).where(finalCondition);
    }
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;

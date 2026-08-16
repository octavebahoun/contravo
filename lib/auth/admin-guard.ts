import { headers } from 'next/headers';
import { ApiError } from '@/lib/rbac';

export type AdminApiContext = {
  userId: string;
  isSuperAdmin: boolean;
};

export async function getAdminContext(): Promise<AdminApiContext> {
  const headersList = await headers();
  const isSuperAdmin = headersList.get('x-is-super-admin') === 'true';
  const userId = headersList.get('x-user-id');

  if (!userId || !isSuperAdmin) {
    throw new ApiError('PERMISSION_DENIED', 'Accès réservé au Super-Admin Contravo.', 403);
  }

  return {
    userId,
    isSuperAdmin,
  };
}

export async function requireSuperAdmin(): Promise<AdminApiContext> {
  return getAdminContext();
}

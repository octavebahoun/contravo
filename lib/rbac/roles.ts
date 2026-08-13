export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = typeof ROLES[number];

export const PERMISSIONS = {
  'org.delete':        ['owner'],
  'org.update':        ['owner', 'admin'],
  'member.invite':     ['owner', 'admin'],
  'member.remove':     ['owner', 'admin'],
  'member.role.change':['owner'],
  'member.list':       ['owner', 'admin', 'member', 'viewer'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSIONS = {
  eventsRead: 'events.read',
  eventsCreate: 'events.create',
  eventsUpdate: 'events.update',
  eventsPublish: 'events.publish',
  registrationsRead: 'events.registrations_read',
  eventsRegister: 'events.register',
  usersRead: 'users.read',
  usersCreate: 'users.create',
  usersUpdate: 'users.update',
  rolesRead: 'roles.read',
  rolesManage: 'roles.manage',
  settingsRead: 'settings.read',
  settingsManage: 'settings.manage',
  auditRead: 'audit.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  roles: string[];
  permissions: Permission[];
}

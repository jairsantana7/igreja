export const PERMISSIONS = {
  eventsRead: 'events.read',
  eventsCreate: 'events.create',
  eventsUpdate: 'events.update',
  eventsPublish: 'events.publish',
  registrationsRead: 'events.registrations_read',
  eventsRegister: 'events.register',
  eventsCheckin: 'events.checkin',
  eventsCommunicate: 'events.communicate',
  eventTemplatesManage: 'events.templates_manage',
  usersRead: 'users.read',
  usersCreate: 'users.create',
  usersUpdate: 'users.update',
  rolesRead: 'roles.read',
  rolesManage: 'roles.manage',
  settingsRead: 'settings.read',
  settingsManage: 'settings.manage',
  auditRead: 'audit.read',
  sessionsManage: 'sessions.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  roles: string[];
  permissions: Permission[];
  sessionId?: string;
}

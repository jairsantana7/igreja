export const PERMISSIONS = {
  eventsRead: 'events.read',
  eventsCreate: 'events.create',
  eventsUpdate: 'events.update',
  eventsPublish: 'events.publish',
  registrationsRead: 'events.registrations_read',
  eventsRegister: 'events.register',
  eventsReadAll: 'events.read_all',
  eventsManageAll: 'events.manage_all',
  eventCollaboratorsManage: 'events.collaborators_manage',
  eventsCheckin: 'events.checkin',
  eventsCommunicate: 'events.communicate',
  eventTemplatesManage: 'events.templates_manage',
  usersRead: 'users.read',
  usersCreate: 'users.create',
  usersUpdate: 'users.update',
  memberProfilesRead: 'members.profile_read',
  memberProfilesManage: 'members.profile_manage',
  rolesRead: 'roles.read',
  rolesManage: 'roles.manage',
  settingsRead: 'settings.read',
  settingsManage: 'settings.manage',
  auditRead: 'audit.read',
  sessionsManage: 'sessions.manage',
  conversationsRead: 'conversations.read',
  conversationsReadAll: 'conversations.read_all',
  conversationsReply: 'conversations.reply',
  conversationsAssign: 'conversations.assign',
  channelsManageOwn: 'channels.manage_own',
  channelsManageAll: 'channels.manage_all',
  whatsappTemplatesRead: 'whatsapp.templates_read',
  whatsappTemplatesSync: 'whatsapp.templates_sync',
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

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
  eventsRemindersManage: 'events.reminders_manage',
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
  communicationTemplatesRead: 'communications.templates_read',
  communicationTemplatesManage: 'communications.templates_manage',
  followupsReadOwn: 'followups.read_own',
  followupsReadAll: 'followups.read_all',
  followupsManage: 'followups.manage',
  followupsNotesRead: 'followups.notes_read',
  followupsNotesManage: 'followups.notes_manage',
  followupsPipelineManage: 'followups.pipeline_manage',
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

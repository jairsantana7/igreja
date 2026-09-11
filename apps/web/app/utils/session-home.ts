interface SessionHomeUser {
  permissions: string[];
}

const destinations: Array<{ permissions: string[]; path: string }> = [
  { permissions: ['events.read'], path: '/dashboard' },
  { permissions: ['events.member_portal_read'], path: '/my-events' },
  { permissions: ['conversations.read'], path: '/conversations' },
  { permissions: ['followups.read_own', 'followups.read_all'], path: '/followups' },
  { permissions: ['galleries.read_own', 'galleries.read_all'], path: '/galleries' },
  { permissions: ['users.read'], path: '/members' },
  { permissions: ['communications.templates_read'], path: '/communication' },
  { permissions: ['roles.read'], path: '/access' },
  { permissions: ['audit.read'], path: '/audit' },
  { permissions: ['settings.read'], path: '/settings' },
];

export function sessionHomePath(user: SessionHomeUser): string {
  return destinations.find((destination) => (
    destination.permissions.some((permission) => user.permissions.includes(permission))
  ))?.path ?? '/no-access';
}

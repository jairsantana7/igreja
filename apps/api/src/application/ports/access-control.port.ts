import type { AuthenticatedPrincipal, Permission } from '../../domain/entities/permission';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: Permission[];
}

export interface AccessControlRepository {
  list(principal: AuthenticatedPrincipal): Promise<{ permissions: { key: string; description: string }[]; roles: RoleView[] }>;
  createRole(principal: AuthenticatedPrincipal, input: { key: string; name: string; permissions: string[] }): Promise<RoleView>;
  createUser(principal: AuthenticatedPrincipal, input: { name: string; email: string; passwordHash: string; roleIds: string[] }): Promise<{ id: string; name: string; email: string }>;
}

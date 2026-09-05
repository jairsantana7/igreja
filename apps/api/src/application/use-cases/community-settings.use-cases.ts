import type { CommunitySettingsProps } from '../../domain/entities/community-settings';
import { CommunitySettings } from '../../domain/entities/community-settings';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import type { CommunitySettingsRepository } from '../ports/community-settings.port';
import { AuthorizationError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission) {
  if (!principal.permissions.includes(permission)) {
    throw new AuthorizationError('Você não tem permissão para administrar as configurações da comunidade.');
  }
}

export class GetCommunitySettingsUseCase {
  constructor(private readonly settings: CommunitySettingsRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.settingsRead);
    return this.settings.get(principal);
  }
}

export class UpdateCommunitySettingsUseCase {
  constructor(private readonly settings: CommunitySettingsRepository) {}
  execute(principal: AuthenticatedPrincipal, input: CommunitySettingsProps) {
    requirePermission(principal, PERMISSIONS.settingsManage);
    return this.settings.save(principal, CommunitySettings.create(input));
  }
}

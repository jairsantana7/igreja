import type { CommunitySettingsProps } from '../../domain/entities/community-settings';
import { CommunitySettings } from '../../domain/entities/community-settings';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import type { CommunitySettingsRepository } from '../ports/community-settings.port';
import type { CacheStore } from '../ports/cache-store.port';
import { AuthorizationError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission) {
  if (!principal.permissions.includes(permission)) {
    throw new AuthorizationError('Você não tem permissão para administrar as configurações da comunidade.');
  }
}

export class GetCommunitySettingsUseCase {
  constructor(private readonly settings: CommunitySettingsRepository, private readonly cache: CacheStore) {}
  async execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.settingsRead);
    const key = `community-settings:${principal.tenantId}`;
    const cached = await this.cache.get<CommunitySettingsProps>(key);
    if (cached) return cached;
    const settings = await this.settings.get(principal);
    await this.cache.set(key, settings, 60);
    return settings;
  }
}

export class UpdateCommunitySettingsUseCase {
  constructor(private readonly settings: CommunitySettingsRepository, private readonly cache: CacheStore) {}
  async execute(principal: AuthenticatedPrincipal, input: CommunitySettingsProps) {
    requirePermission(principal, PERMISSIONS.settingsManage);
    const saved = await this.settings.save(principal, CommunitySettings.create(input));
    await this.cache.delete(`community-settings:${principal.tenantId}`);
    return saved;
  }
}

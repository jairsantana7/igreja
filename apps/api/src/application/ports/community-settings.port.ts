import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { CommunitySettings, CommunitySettingsProps } from '../../domain/entities/community-settings';

export interface CommunitySettingsRepository {
  get(principal: AuthenticatedPrincipal): Promise<CommunitySettingsProps>;
  save(principal: AuthenticatedPrincipal, settings: CommunitySettings): Promise<CommunitySettingsProps>;
}

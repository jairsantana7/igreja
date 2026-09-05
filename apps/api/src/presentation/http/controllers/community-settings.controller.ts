import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import type { GetCommunitySettingsUseCase, UpdateCommunitySettingsUseCase } from '../../../application/use-cases/community-settings.use-cases';
import { TOKENS } from '../../../application/ports/tokens';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { UpdateCommunitySettingsDto } from '../dto/community-settings.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunitySettingsController {
  constructor(
    @Inject(TOKENS.getCommunitySettingsUseCase) private readonly getSettings: GetCommunitySettingsUseCase,
    @Inject(TOKENS.updateCommunitySettingsUseCase) private readonly updateSettings: UpdateCommunitySettingsUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.settingsRead)
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.getSettings.execute(principal);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.settingsManage)
  update(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: UpdateCommunitySettingsDto) {
    return this.updateSettings.execute(principal, dto);
  }
}

import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { GetMemberProfileUseCase, UpdateMemberProfileUseCase } from '../../../application/use-cases/member-profile.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { UpdateMemberProfileDto } from '../dto/member-profile.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberProfilesController {
  constructor(
    @Inject(TOKENS.getMemberProfileUseCase) private readonly getProfile: GetMemberProfileUseCase,
    @Inject(TOKENS.updateMemberProfileUseCase) private readonly updateProfile: UpdateMemberProfileUseCase,
  ) {}

  @Get(':memberId/profile')
  @RequirePermissions(PERMISSIONS.memberProfilesRead)
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('memberId', new ParseUUIDPipe()) memberId: string) {
    return this.getProfile.execute(principal, memberId);
  }

  @Put(':memberId/profile')
  @RequirePermissions(PERMISSIONS.memberProfilesManage)
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body() dto: UpdateMemberProfileDto,
  ) {
    return this.updateProfile.execute(principal, memberId, dto);
  }
}

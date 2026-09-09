import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { GetMemberProfileUseCase, StartMemberConversationUseCase, UpdateMemberProfileUseCase } from '../../../application/use-cases/member-profile.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { StartMemberConversationDto, UpdateMemberProfileDto } from '../dto/member-profile.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberProfilesController {
  constructor(
    @Inject(TOKENS.getMemberProfileUseCase) private readonly getProfile: GetMemberProfileUseCase,
    @Inject(TOKENS.updateMemberProfileUseCase) private readonly updateProfile: UpdateMemberProfileUseCase,
    @Inject(TOKENS.startMemberConversationUseCase) private readonly startConversation: StartMemberConversationUseCase,
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

  @Post(':memberId/conversations')
  @RequirePermissions(PERMISSIONS.memberProfilesRead, PERMISSIONS.conversationsReply)
  start(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body() dto: StartMemberConversationDto,
  ) {
    return this.startConversation.execute(principal, memberId, dto);
  }
}

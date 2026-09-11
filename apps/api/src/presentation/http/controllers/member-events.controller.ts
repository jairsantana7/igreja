import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { ListMemberEventsUseCase } from '../../../application/use-cases/member-events.use-case';
import { TOKENS } from '../../../application/ports/tokens';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('member/events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberEventsController {
  constructor(@Inject(TOKENS.listMemberEventsUseCase) private readonly listEvents: ListMemberEventsUseCase) {}

  @Get()
  @RequirePermissions(PERMISSIONS.memberEventsRead)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.listEvents.execute(principal);
  }
}

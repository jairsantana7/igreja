import { Controller, Delete, Get, HttpCode, HttpStatus, Inject, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TOKENS } from '../../../application/ports/tokens';
import type { ListSessionsUseCase, RevokeCurrentSessionUseCase, RevokeOtherSessionsUseCase } from '../../../application/use-cases/session.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { clearBrowserSession } from '../session-http';

@Controller('sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
  constructor(
    @Inject(TOKENS.listSessionsUseCase) private readonly listSessions: ListSessionsUseCase,
    @Inject(TOKENS.revokeOtherSessionsUseCase) private readonly revokeOtherSessions: RevokeOtherSessionsUseCase,
    @Inject(TOKENS.revokeCurrentSessionUseCase) private readonly revokeCurrentSession: RevokeCurrentSessionUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.sessionsManage)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.listSessions.execute(principal);
  }

  @Delete('others')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.sessionsManage)
  revokeOthers(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.revokeOtherSessions.execute(principal);
  }

  @Delete('current')
  @HttpCode(HttpStatus.OK)
  async revokeCurrent(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Res({ passthrough: true }) response: Response) {
    const result = await this.revokeCurrentSession.execute(principal);
    clearBrowserSession(response);
    return result;
  }
}

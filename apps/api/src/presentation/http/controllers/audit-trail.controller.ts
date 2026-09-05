import { Controller, Get, Inject, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type { ListAuditEventsUseCase } from '../../../application/use-cases/audit-trail.use-case';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditTrailController {
  constructor(@Inject(TOKENS.listAuditEventsUseCase) private readonly listAuditEvents: ListAuditEventsUseCase) {}

  @Get()
  @RequirePermissions(PERMISSIONS.auditRead)
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('eventId', new ParseUUIDPipe({ optional: true })) eventId?: string,
  ) {
    return this.listAuditEvents.execute(principal, eventId);
  }
}

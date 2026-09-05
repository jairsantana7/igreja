import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import type { CreateEventUseCase, GetDashboardUseCase } from '../../../application/use-cases/event.use-cases';
import { TOKENS } from '../../../application/ports/tokens';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateEventDto } from '../dto/event.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    @Inject(TOKENS.dashboardUseCase) private readonly dashboard: GetDashboardUseCase,
    @Inject(TOKENS.createEventUseCase) private readonly createEvent: CreateEventUseCase,
  ) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.eventsRead)
  getDashboard(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.dashboard.execute(principal);
  }

  @Post('events')
  @RequirePermissions(PERMISSIONS.eventsCreate)
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: CreateEventDto) {
    return this.createEvent.execute(principal, {
      ...dto,
      startsAt: new Date(dto.startsAt),
      registrationDeadline: dto.registrationDeadline ? new Date(dto.registrationDeadline) : undefined,
    });
  }
}

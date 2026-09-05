import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import type { CancelEventUseCase, CloseEventRegistrationsUseCase, CompleteEventUseCase, CreateEventUseCase, GetDashboardUseCase, GetEventUseCase, ListEventCollaboratorCandidatesUseCase, ListEventsUseCase, UpdateEventCollaboratorsUseCase, UpdateEventUseCase } from '../../../application/use-cases/event.use-cases';
import { TOKENS } from '../../../application/ports/tokens';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateEventDto, UpdateEventCollaboratorsDto, UpdateEventDto } from '../dto/event.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    @Inject(TOKENS.dashboardUseCase) private readonly dashboard: GetDashboardUseCase,
    @Inject(TOKENS.listEventsUseCase) private readonly listEvents: ListEventsUseCase,
    @Inject(TOKENS.createEventUseCase) private readonly createEvent: CreateEventUseCase,
    @Inject(TOKENS.getEventUseCase) private readonly getEvent: GetEventUseCase,
    @Inject(TOKENS.updateEventUseCase) private readonly updateEvent: UpdateEventUseCase,
    @Inject(TOKENS.cancelEventUseCase) private readonly cancelEvent: CancelEventUseCase,
    @Inject(TOKENS.closeEventRegistrationsUseCase) private readonly closeRegistrations: CloseEventRegistrationsUseCase,
    @Inject(TOKENS.completeEventUseCase) private readonly completeEvent: CompleteEventUseCase,
    @Inject(TOKENS.updateEventCollaboratorsUseCase) private readonly updateCollaborators: UpdateEventCollaboratorsUseCase,
    @Inject(TOKENS.listEventCollaboratorCandidatesUseCase) private readonly listCollaboratorCandidates: ListEventCollaboratorCandidatesUseCase,
  ) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.eventsRead)
  getDashboard(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.dashboard.execute(principal);
  }

  @Get('events')
  @RequirePermissions(PERMISSIONS.eventsRead)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.listEvents.execute(principal);
  }

  @Get('events/:eventId')
  @RequirePermissions(PERMISSIONS.eventsRead)
  getOne(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.getEvent.execute(principal, eventId);
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

  @Put('events/:eventId')
  @RequirePermissions(PERMISSIONS.eventsUpdate)
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.updateEvent.execute(principal, eventId, {
      ...dto,
      startsAt: new Date(dto.startsAt),
      registrationDeadline: dto.registrationDeadline ? new Date(dto.registrationDeadline) : undefined,
    });
  }

  @Post('events/:eventId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.eventsPublish)
  cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.cancelEvent.execute(principal, eventId);
  }

  @Post('events/:eventId/close-registrations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.eventsPublish)
  close(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.closeRegistrations.execute(principal, eventId);
  }

  @Post('events/:eventId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.eventsPublish)
  complete(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.completeEvent.execute(principal, eventId);
  }

  @Put('events/:eventId/collaborators')
  @RequirePermissions(PERMISSIONS.eventCollaboratorsManage)
  collaborators(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: UpdateEventCollaboratorsDto,
  ) {
    return this.updateCollaborators.execute(principal, eventId, dto.userIds);
  }

  @Get('events/:eventId/collaborator-candidates')
  @RequirePermissions(PERMISSIONS.eventCollaboratorsManage)
  collaboratorCandidates(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ) {
    return this.listCollaboratorCandidates.execute(principal, eventId);
  }
}

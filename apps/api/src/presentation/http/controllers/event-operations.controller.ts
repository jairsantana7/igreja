import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type {
  CheckInRegistrationUseCase,
  CheckInParticipantUseCase,
  CreateEventCommunicationUseCase,
  CreateEventTemplateUseCase,
  ListEventCommunicationsUseCase,
  ListEventRegistrationsUseCase,
  ListEventTemplatesUseCase,
  QueueEventCommunicationUseCase,
  UndoRegistrationCheckInUseCase,
  UndoParticipantCheckInUseCase,
} from '../../../application/use-cases/event-operations.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CreateEventCommunicationDto, CreateEventTemplateDto } from '../dto/event-operations.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventOperationsController {
  constructor(
    @Inject(TOKENS.listEventRegistrationsUseCase) private readonly listRegistrations: ListEventRegistrationsUseCase,
    @Inject(TOKENS.checkInRegistrationUseCase) private readonly checkIn: CheckInRegistrationUseCase,
    @Inject(TOKENS.undoRegistrationCheckInUseCase) private readonly undoCheckIn: UndoRegistrationCheckInUseCase,
    @Inject(TOKENS.checkInParticipantUseCase) private readonly checkInParticipant: CheckInParticipantUseCase,
    @Inject(TOKENS.undoParticipantCheckInUseCase) private readonly undoParticipantCheckIn: UndoParticipantCheckInUseCase,
    @Inject(TOKENS.listEventCommunicationsUseCase) private readonly listCommunications: ListEventCommunicationsUseCase,
    @Inject(TOKENS.createEventCommunicationUseCase) private readonly createCommunication: CreateEventCommunicationUseCase,
    @Inject(TOKENS.queueEventCommunicationUseCase) private readonly queueCommunication: QueueEventCommunicationUseCase,
    @Inject(TOKENS.listEventTemplatesUseCase) private readonly listTemplates: ListEventTemplatesUseCase,
    @Inject(TOKENS.createEventTemplateUseCase) private readonly createTemplate: CreateEventTemplateUseCase,
  ) {}

  @Get('events/:eventId/registrations')
  @RequirePermissions(PERMISSIONS.registrationsRead)
  registrations(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.listRegistrations.execute(principal, eventId);
  }

  @Post('events/:eventId/registrations/:registrationId/check-in')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.eventsCheckin)
  confirmCheckIn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('registrationId', new ParseUUIDPipe()) registrationId: string,
  ) {
    return this.checkIn.execute(principal, eventId, registrationId);
  }

  @Delete('events/:eventId/registrations/:registrationId/check-in')
  @RequirePermissions(PERMISSIONS.eventsCheckin)
  removeCheckIn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('registrationId', new ParseUUIDPipe()) registrationId: string,
  ) {
    return this.undoCheckIn.execute(principal, eventId, registrationId);
  }

  @Post('events/:eventId/registrations/:registrationId/participants/:participantId/check-in')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.eventsCheckin)
  confirmParticipantCheckIn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('registrationId', new ParseUUIDPipe()) registrationId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
  ) {
    return this.checkInParticipant.execute(principal, eventId, registrationId, participantId);
  }

  @Delete('events/:eventId/registrations/:registrationId/participants/:participantId/check-in')
  @RequirePermissions(PERMISSIONS.eventsCheckin)
  removeParticipantCheckIn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('registrationId', new ParseUUIDPipe()) registrationId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
  ) {
    return this.undoParticipantCheckIn.execute(principal, eventId, registrationId, participantId);
  }

  @Get('events/:eventId/communications')
  @RequirePermissions(PERMISSIONS.eventsCommunicate)
  communications(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.listCommunications.execute(principal, eventId);
  }

  @Post('events/:eventId/communications')
  @RequirePermissions(PERMISSIONS.eventsCommunicate)
  addCommunication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: CreateEventCommunicationDto,
  ) {
    return this.createCommunication.execute(principal, eventId, dto);
  }

  @Post('events/:eventId/communications/:communicationId/queue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.eventsCommunicate)
  enqueueCommunication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('communicationId', new ParseUUIDPipe()) communicationId: string,
  ) {
    return this.queueCommunication.execute(principal, eventId, communicationId);
  }

  @Get('event-templates')
  @RequirePermissions(PERMISSIONS.eventTemplatesManage)
  templates(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.listTemplates.execute(principal);
  }

  @Post('events/:eventId/template')
  @RequirePermissions(PERMISSIONS.eventTemplatesManage)
  saveTemplate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: CreateEventTemplateDto,
  ) {
    return this.createTemplate.execute(principal, eventId, dto.name);
  }
}

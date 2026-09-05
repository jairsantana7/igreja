import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../../application/ports/tokens';
import type {
  CreateCommunicationTemplateUseCase,
  CreateEventReminderUseCase,
  DeleteEventReminderUseCase,
  ListCommunicationTemplatesUseCase,
  ListCommunicationTemplateVersionsUseCase,
  ListEventRemindersUseCase,
  SetCommunicationTemplateStatusUseCase,
  UpdateCommunicationTemplateUseCase,
  UpdateEventReminderUseCase,
} from '../../../application/use-cases/communication-template.use-cases';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../../domain/entities/permission';
import { CurrentPrincipal } from '../decorators/current-principal.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { SaveCommunicationTemplateDto, SaveEventReminderDto, SetCommunicationTemplateStatusDto } from '../dto/communication-template.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationController {
  constructor(
    @Inject(TOKENS.listCommunicationTemplatesUseCase) private readonly listTemplates: ListCommunicationTemplatesUseCase,
    @Inject(TOKENS.listCommunicationTemplateVersionsUseCase) private readonly listVersions: ListCommunicationTemplateVersionsUseCase,
    @Inject(TOKENS.createCommunicationTemplateUseCase) private readonly createTemplate: CreateCommunicationTemplateUseCase,
    @Inject(TOKENS.updateCommunicationTemplateUseCase) private readonly updateTemplate: UpdateCommunicationTemplateUseCase,
    @Inject(TOKENS.setCommunicationTemplateStatusUseCase) private readonly setTemplateStatus: SetCommunicationTemplateStatusUseCase,
    @Inject(TOKENS.listEventRemindersUseCase) private readonly listReminders: ListEventRemindersUseCase,
    @Inject(TOKENS.createEventReminderUseCase) private readonly createReminder: CreateEventReminderUseCase,
    @Inject(TOKENS.updateEventReminderUseCase) private readonly updateReminder: UpdateEventReminderUseCase,
    @Inject(TOKENS.deleteEventReminderUseCase) private readonly deleteReminder: DeleteEventReminderUseCase,
  ) {}

  @Get('communication/templates')
  @RequirePermissions(PERMISSIONS.communicationTemplatesRead)
  templates(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.listTemplates.execute(principal); }

  @Get('communication/templates/:templateId/versions')
  @RequirePermissions(PERMISSIONS.communicationTemplatesRead)
  versions(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('templateId', new ParseUUIDPipe()) id: string) { return this.listVersions.execute(principal, id); }

  @Post('communication/templates')
  @RequirePermissions(PERMISSIONS.communicationTemplatesManage)
  addTemplate(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() dto: SaveCommunicationTemplateDto) { return this.createTemplate.execute(principal, dto); }

  @Put('communication/templates/:templateId')
  @RequirePermissions(PERMISSIONS.communicationTemplatesManage)
  editTemplate(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('templateId', new ParseUUIDPipe()) id: string, @Body() dto: SaveCommunicationTemplateDto) { return this.updateTemplate.execute(principal, id, dto); }

  @Put('communication/templates/:templateId/status')
  @RequirePermissions(PERMISSIONS.communicationTemplatesManage)
  status(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('templateId', new ParseUUIDPipe()) id: string, @Body() dto: SetCommunicationTemplateStatusDto) { return this.setTemplateStatus.execute(principal, id, dto.status); }

  @Get('events/:eventId/reminders')
  @RequirePermissions(PERMISSIONS.eventsRemindersManage)
  reminders(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('eventId', new ParseUUIDPipe()) id: string) { return this.listReminders.execute(principal, id); }

  @Post('events/:eventId/reminders')
  @RequirePermissions(PERMISSIONS.eventsRemindersManage)
  addReminder(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('eventId', new ParseUUIDPipe()) id: string, @Body() dto: SaveEventReminderDto) { return this.createReminder.execute(principal, id, dto); }

  @Put('events/:eventId/reminders/:reminderId')
  @RequirePermissions(PERMISSIONS.eventsRemindersManage)
  editReminder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Body() dto: SaveEventReminderDto,
  ) { return this.updateReminder.execute(principal, eventId, reminderId, dto); }

  @Delete('events/:eventId/reminders/:reminderId')
  @RequirePermissions(PERMISSIONS.eventsRemindersManage)
  removeReminder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
  ) { return this.deleteReminder.execute(principal, eventId, reminderId); }
}

import { COMMUNICATION_TEMPLATE_STATUSES, CommunicationTemplateContent, EventReminderConfiguration, type CommunicationTemplateStatus } from '../../domain/entities/communication-template';
import { DomainError } from '../../domain/entities/errors';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { CommunicationTemplateRepository, EventReminderRepository, SaveEventReminderResult } from '../ports/communication-template.port';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: typeof PERMISSIONS[keyof typeof PERMISSIONS]) {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para realizar esta operação.');
}

export class ListCommunicationTemplatesUseCase {
  constructor(private readonly templates: CommunicationTemplateRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.communicationTemplatesRead);
    return this.templates.list(principal);
  }
}

export class ListCommunicationTemplateVersionsUseCase {
  constructor(private readonly templates: CommunicationTemplateRepository) {}
  async execute(principal: AuthenticatedPrincipal, templateId: string) {
    requirePermission(principal, PERMISSIONS.communicationTemplatesRead);
    const versions = await this.templates.versions(principal, templateId);
    if (!versions) throw new NotFoundError('Modelo de mensagem não encontrado.');
    return versions;
  }
}

type TemplateInput = Parameters<typeof CommunicationTemplateContent.create>[0];

export class CreateCommunicationTemplateUseCase {
  constructor(private readonly templates: CommunicationTemplateRepository) {}
  execute(principal: AuthenticatedPrincipal, input: TemplateInput) {
    requirePermission(principal, PERMISSIONS.communicationTemplatesManage);
    return this.templates.create(principal, CommunicationTemplateContent.create(input));
  }
}

export class UpdateCommunicationTemplateUseCase {
  constructor(private readonly templates: CommunicationTemplateRepository) {}
  async execute(principal: AuthenticatedPrincipal, templateId: string, input: TemplateInput) {
    requirePermission(principal, PERMISSIONS.communicationTemplatesManage);
    const updated = await this.templates.update(principal, templateId, CommunicationTemplateContent.create(input));
    if (!updated) throw new NotFoundError('Modelo de mensagem não encontrado.');
    return updated;
  }
}

export class SetCommunicationTemplateStatusUseCase {
  constructor(private readonly templates: CommunicationTemplateRepository) {}
  async execute(principal: AuthenticatedPrincipal, templateId: string, status: CommunicationTemplateStatus) {
    requirePermission(principal, PERMISSIONS.communicationTemplatesManage);
    if (!COMMUNICATION_TEMPLATE_STATUSES.includes(status)) throw new DomainError('O estado do modelo é inválido.');
    const updated = await this.templates.setStatus(principal, templateId, status);
    if (!updated) throw new NotFoundError('Modelo de mensagem não encontrado.');
    return updated;
  }
}

export class ListEventRemindersUseCase {
  constructor(private readonly reminders: EventReminderRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventsRemindersManage);
    const items = await this.reminders.list(principal, eventId);
    if (!items) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return items;
  }
}

type ReminderInput = { templateId: string; channelId: string; audience: 'confirmed' | 'checked_in' | 'not_checked_in'; offsetMinutesBefore: number; enabled: boolean };

function unwrapReminder(result: SaveEventReminderResult) {
  if (result.ok) return result.value;
  if (result.reason === 'event_not_found' || result.reason === 'reminder_not_found') throw new NotFoundError('Evento ou lembrete não encontrado.');
  if (result.reason === 'template_not_active') throw new ConflictError('Escolha um modelo local ativo.');
  throw new ConflictError('O canal não está disponível para este usuário.');
}

export class CreateEventReminderUseCase {
  constructor(private readonly reminders: EventReminderRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, input: ReminderInput) {
    requirePermission(principal, PERMISSIONS.eventsRemindersManage);
    const config = EventReminderConfiguration.create(input);
    return unwrapReminder(await this.reminders.create(principal, eventId, input.templateId, input.channelId, config));
  }
}

export class UpdateEventReminderUseCase {
  constructor(private readonly reminders: EventReminderRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, reminderId: string, input: ReminderInput) {
    requirePermission(principal, PERMISSIONS.eventsRemindersManage);
    const config = EventReminderConfiguration.create(input);
    return unwrapReminder(await this.reminders.update(principal, eventId, reminderId, input.templateId, input.channelId, config));
  }
}

export class DeleteEventReminderUseCase {
  constructor(private readonly reminders: EventReminderRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, reminderId: string) {
    requirePermission(principal, PERMISSIONS.eventsRemindersManage);
    const removed = await this.reminders.remove(principal, eventId, reminderId);
    if (removed === null) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    if (!removed) throw new NotFoundError('Lembrete não encontrado.');
    return { removed: true };
  }
}

import { randomUUID } from 'node:crypto';
import { EventDraft } from '../../domain/entities/event';
import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import type { EventRepository, RegistrationAnswerInput } from '../ports/event.port';
import { AuthorizationError, NotFoundError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission): void {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para realizar esta ação.');
}

export class GetDashboardUseCase {
  constructor(private readonly events: EventRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.eventsRead);
    return this.events.dashboard(principal);
  }
}

export class ListEventsUseCase {
  constructor(private readonly events: EventRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.eventsRead);
    return this.events.list(principal);
  }
}

export class CreateEventUseCase {
  constructor(private readonly events: EventRepository) {}
  execute(principal: AuthenticatedPrincipal, input: Parameters<typeof EventDraft.create>[0]) {
    requirePermission(principal, PERMISSIONS.eventsCreate);
    if (input.publish) requirePermission(principal, PERMISSIONS.eventsPublish);
    const fields = input.fields.map((field, index) => ({ ...field, key: field.key || `campo_${index + 1}_${randomUUID().slice(0, 6)}` }));
    const offerings = input.offerings.map((offering, index) => ({ ...offering, key: offering.key || `adicional_${index + 1}_${randomUUID().slice(0, 6)}` }));
    return this.events.create(principal, EventDraft.create({ ...input, fields, offerings }));
  }
}

export class GetEventUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventsRead);
    const event = await this.events.findById(principal, eventId);
    if (!event) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return event;
  }
}

export class UpdateEventUseCase {
  constructor(private readonly events: EventRepository) {}
  execute(principal: AuthenticatedPrincipal, eventId: string, input: Omit<Parameters<typeof EventDraft.create>[0], 'publish'>) {
    requirePermission(principal, PERMISSIONS.eventsUpdate);
    const fields = input.fields.map((field, index) => ({ ...field, key: field.key || `campo_${index + 1}_${randomUUID().slice(0, 6)}` }));
    const offerings = input.offerings.map((offering, index) => ({ ...offering, key: offering.key || `adicional_${index + 1}_${randomUUID().slice(0, 6)}` }));
    return this.events.update(principal, eventId, EventDraft.create({ ...input, publish: false, fields, offerings }));
  }
}

export class CancelEventUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventsPublish);
    const event = await this.events.cancel(principal, eventId);
    if (!event) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return event;
  }
}

export class CloseEventRegistrationsUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventsPublish);
    const event = await this.events.closeRegistrations(principal, eventId);
    if (!event) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return event;
  }
}

export class CompleteEventUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventsPublish);
    const event = await this.events.complete(principal, eventId);
    if (!event) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return event;
  }
}

export class UpdateEventCollaboratorsUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, userIds: string[]) {
    requirePermission(principal, PERMISSIONS.eventCollaboratorsManage);
    const event = await this.events.setCollaborators(principal, eventId, [...new Set(userIds)]);
    if (!event) throw new NotFoundError('Evento não encontrado ou sem acesso para compartilhar.');
    return event;
  }
}

export class ListEventCollaboratorCandidatesUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventCollaboratorsManage);
    const users = await this.events.listCollaboratorCandidates(principal, eventId);
    if (!users) throw new NotFoundError('Evento não encontrado ou sem acesso para compartilhar.');
    return users;
  }
}

export class GetPublicEventUseCase {
  constructor(private readonly events: EventRepository) {}
  async execute(publicId: string) {
    const event = await this.events.findPublic(publicId);
    if (!event) throw new NotFoundError('Evento não encontrado ou ainda não publicado.');
    const { tenantId: _tenantId, ...safeEvent } = event;
    return safeEvent;
  }

  async resolve(publicId: string) {
    const event = await this.events.findPublic(publicId);
    if (!event) throw new NotFoundError('Evento não encontrado ou ainda não publicado.');
    return event;
  }
}

export function validateAnswers(eventFields: Awaited<ReturnType<GetPublicEventUseCase['resolve']>>['fields'], answers: RegistrationAnswerInput[]) {
  const byId = new Map(answers.map((answer) => [answer.fieldId, answer.value]));
  for (const field of eventFields) {
    const value = byId.get(field.id!);
    if (field.required && (value === undefined || value === null || value === '' || value === false)) {
      throw new Error(`O campo “${field.label}” é obrigatório.`);
    }
    if (field.type === 'single_choice' && value !== undefined && !field.options.includes(String(value))) {
      throw new Error(`A resposta do campo “${field.label}” é inválida.`);
    }
  }
  if (answers.some((answer) => !eventFields.some((field) => field.id === answer.fieldId))) {
    throw new Error('O formulário contém um campo desconhecido.');
  }
}

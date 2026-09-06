import { PERMISSIONS, type AuthenticatedPrincipal, type Permission } from '../../domain/entities/permission';
import type { EventCommunicationRepository, EventOperationsRepository, EventTemplateRepository, CommunicationAudience, CommunicationChannel } from '../ports/event-operations.port';
import type { JobQueue } from '../ports/job-queue.port';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

function requirePermission(principal: AuthenticatedPrincipal, permission: Permission): void {
  if (!principal.permissions.includes(permission)) throw new AuthorizationError('Você não tem permissão para realizar esta ação.');
}

export class ListEventRegistrationsUseCase {
  constructor(private readonly operations: EventOperationsRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.registrationsRead);
    const registrations = await this.operations.listRegistrations(principal, eventId);
    if (!registrations) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return registrations;
  }
}

export class CheckInRegistrationUseCase {
  constructor(private readonly operations: EventOperationsRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, registrationId: string) {
    requirePermission(principal, PERMISSIONS.eventsCheckin);
    const checkIn = await this.operations.checkIn(principal, eventId, registrationId);
    if (!checkIn) throw new NotFoundError('Inscrição confirmada não encontrada neste evento.');
    return checkIn;
  }
}

export class UndoRegistrationCheckInUseCase {
  constructor(private readonly operations: EventOperationsRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, registrationId: string) {
    requirePermission(principal, PERMISSIONS.eventsCheckin);
    const removed = await this.operations.undoCheckIn(principal, eventId, registrationId);
    if (removed === null) throw new NotFoundError('Inscrição não encontrada neste evento.');
    return { checkedIn: false };
  }
}

export class CheckInParticipantUseCase {
  constructor(private readonly operations: EventOperationsRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, registrationId: string, participantId: string) {
    requirePermission(principal, PERMISSIONS.eventsCheckin);
    const checkIn = await this.operations.checkInParticipant(principal, eventId, registrationId, participantId);
    if (!checkIn) throw new NotFoundError('Participante não encontrado nesta inscrição.');
    return checkIn;
  }
}

export class UndoParticipantCheckInUseCase {
  constructor(private readonly operations: EventOperationsRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, registrationId: string, participantId: string) {
    requirePermission(principal, PERMISSIONS.eventsCheckin);
    const checkIn = await this.operations.undoParticipantCheckIn(principal, eventId, registrationId, participantId);
    if (!checkIn) throw new NotFoundError('Participante não encontrado nesta inscrição.');
    return checkIn;
  }
}

export class ListEventCommunicationsUseCase {
  constructor(private readonly communications: EventCommunicationRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string) {
    requirePermission(principal, PERMISSIONS.eventsCommunicate);
    const items = await this.communications.list(principal, eventId);
    if (!items) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return items;
  }
}

export class CreateEventCommunicationUseCase {
  constructor(private readonly communications: EventCommunicationRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, input: { audience: CommunicationAudience; channel: CommunicationChannel; subject: string; message: string }) {
    requirePermission(principal, PERMISSIONS.eventsCommunicate);
    const item = await this.communications.create(principal, eventId, input);
    if (!item) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return item;
  }
}

export class QueueEventCommunicationUseCase {
  constructor(private readonly communications: EventCommunicationRepository, private readonly queue: JobQueue) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, communicationId: string) {
    requirePermission(principal, PERMISSIONS.eventsCommunicate);
    const item = await this.communications.find(principal, eventId, communicationId);
    if (!item) throw new NotFoundError('Comunicação não encontrada neste evento.');
    let job: { jobId: string };
    try {
      job = await this.queue.enqueue({
        name: 'events.communication.dispatch',
        payload: { tenantId: principal.tenantId, eventId, communicationId },
        deduplicationKey: communicationId,
      }, { attempts: 5 });
    } catch {
      throw new ConflictError('A fila de comunicação não está disponível nesta instalação. O rascunho foi preservado.');
    }
    return this.communications.markQueued(principal, eventId, communicationId, job.jobId);
  }
}

export class ListEventTemplatesUseCase {
  constructor(private readonly templates: EventTemplateRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    requirePermission(principal, PERMISSIONS.eventTemplatesManage);
    return this.templates.list(principal);
  }
}

export class CreateEventTemplateUseCase {
  constructor(private readonly templates: EventTemplateRepository) {}
  async execute(principal: AuthenticatedPrincipal, eventId: string, name: string) {
    requirePermission(principal, PERMISSIONS.eventTemplatesManage);
    const template = await this.templates.createFromEvent(principal, eventId, name.trim());
    if (!template) throw new NotFoundError('Evento não encontrado nesta comunidade.');
    return template;
  }
}

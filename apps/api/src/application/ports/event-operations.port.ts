import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { EventFormField, EventMediaDisplayMode } from '../../domain/entities/event';

export interface RegistrationAnswerView {
  fieldId: string;
  label: string;
  value: unknown;
}

export interface ManagedRegistrationView {
  id: string;
  member: { id: string; name: string; email: string };
  status: 'confirmed' | 'cancelled';
  formVersion: number;
  registeredAt: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
  participants: Array<{
    id: string; name: string; sourceType: 'registrant' | 'spouse' | 'child';
    checkedInAt: string | null; checkedInBy: string | null;
  }>;
  offerings: Array<{ id: string; name: string; priceCents: number }>;
  answers: RegistrationAnswerView[];
}

export interface CheckInView {
  registrationId: string;
  checkedInAt: string;
  checkedInBy: string;
}

export interface ParticipantCheckInView {
  participantId: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
}

export interface EventOperationsRepository {
  listRegistrations(principal: AuthenticatedPrincipal, eventId: string): Promise<ManagedRegistrationView[] | null>;
  checkIn(principal: AuthenticatedPrincipal, eventId: string, registrationId: string): Promise<CheckInView | null>;
  undoCheckIn(principal: AuthenticatedPrincipal, eventId: string, registrationId: string): Promise<boolean | null>;
  checkInParticipant(principal: AuthenticatedPrincipal, eventId: string, registrationId: string, participantId: string): Promise<ParticipantCheckInView | null>;
  undoParticipantCheckIn(principal: AuthenticatedPrincipal, eventId: string, registrationId: string, participantId: string): Promise<ParticipantCheckInView | null>;
}

export type CommunicationAudience = 'confirmed' | 'checked_in' | 'not_checked_in';
export type CommunicationChannel = 'email' | 'whatsapp';

export interface EventCommunicationView {
  id: string;
  eventId: string;
  audience: CommunicationAudience;
  channel: CommunicationChannel;
  subject: string;
  message: string;
  status: 'draft' | 'queued' | 'sent' | 'failed';
  createdAt: string;
  queuedAt: string | null;
}

export interface EventCommunicationRepository {
  list(principal: AuthenticatedPrincipal, eventId: string): Promise<EventCommunicationView[] | null>;
  create(principal: AuthenticatedPrincipal, eventId: string, input: {
    audience: CommunicationAudience;
    channel: CommunicationChannel;
    subject: string;
    message: string;
  }): Promise<EventCommunicationView | null>;
  markQueued(principal: AuthenticatedPrincipal, eventId: string, communicationId: string, jobId: string): Promise<EventCommunicationView | null>;
  find(principal: AuthenticatedPrincipal, eventId: string, communicationId: string): Promise<EventCommunicationView | null>;
}

export interface EventTemplateView {
  id: string;
  name: string;
  description: string;
  location: string;
  capacity: number | null;
  mediaDisplayMode: EventMediaDisplayMode;
  fields: EventFormField[];
  createdAt: string;
}

export interface EventTemplateRepository {
  list(principal: AuthenticatedPrincipal): Promise<EventTemplateView[]>;
  createFromEvent(principal: AuthenticatedPrincipal, eventId: string, name: string): Promise<EventTemplateView | null>;
}

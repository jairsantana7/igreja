import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { EventDraft, EventFormField, EventMediaDisplayMode, EventOffering, EventStatus } from '../../domain/entities/event';
import type { RegistrationParticipantSnapshot } from '../../domain/entities/event-registration';
import type { MemberProfileDraft } from '../../domain/entities/member-profile';
import type { LoginIdentity } from './authentication.port';

export interface DashboardEvent {
  id: string;
  publicId: string;
  title: string;
  startsAt: string;
  registrationDeadline: string | null;
  location: string;
  status: EventStatus;
  registrationOpen: boolean;
  capacity: number | null;
  registrations: number;
  participants: number;
  attendance: number;
  owner: { id: string; name: string };
}

export interface DashboardView {
  community: { id: string; name: string };
  user: Pick<AuthenticatedPrincipal, 'userId' | 'name' | 'email' | 'roles' | 'permissions'>;
  events: DashboardEvent[];
}

export interface ManagedEventView extends DashboardEvent {
  description: string;
  mediaDisplayMode: EventMediaDisplayMode;
  fields: Array<EventFormField & { id: string }>;
  familyRegistrationEnabled: boolean;
  offerings: Array<EventOffering & { id: string }>;
  currentFormVersion: number;
  collaborators: Array<{ id: string; name: string; email: string }>;
}

export interface PublicEventView {
  id: string;
  publicId: string;
  tenantId: string;
  communityName: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
  mediaDisplayMode: EventMediaDisplayMode;
  images: { id: string; altText: string }[];
  fields: Required<Pick<EventFormField, 'id'>>[] & EventFormField[];
  familyRegistrationEnabled: boolean;
  offerings: Array<Required<Pick<EventOffering, 'id'>> & EventOffering>;
  pix: { keyType: string; key: string; recipientName: string; city: string } | null;
}

export interface RegistrationContextView {
  profile: {
    phone: string | null; birthDate: string | null; spouseName: string | null; marriageDate: string | null;
    children: Array<{ name: string; birthDate: string | null }>;
  };
  selectedParticipantKeys: string[];
  selectedOfferingIds: string[];
  alreadyRegistered: boolean;
}

export interface EventRepository {
  dashboard(principal: AuthenticatedPrincipal): Promise<DashboardView>;
  list(principal: AuthenticatedPrincipal): Promise<DashboardEvent[]>;
  findById(principal: AuthenticatedPrincipal, eventId: string): Promise<ManagedEventView | null>;
  create(principal: AuthenticatedPrincipal, draft: EventDraft): Promise<DashboardEvent>;
  update(principal: AuthenticatedPrincipal, eventId: string, draft: EventDraft): Promise<DashboardEvent>;
  cancel(principal: AuthenticatedPrincipal, eventId: string): Promise<DashboardEvent | null>;
  closeRegistrations(principal: AuthenticatedPrincipal, eventId: string): Promise<DashboardEvent | null>;
  complete(principal: AuthenticatedPrincipal, eventId: string): Promise<DashboardEvent | null>;
  setCollaborators(principal: AuthenticatedPrincipal, eventId: string, userIds: string[]): Promise<ManagedEventView | null>;
  listCollaboratorCandidates(principal: AuthenticatedPrincipal, eventId: string): Promise<Array<{ id: string; name: string; email: string }> | null>;
  findPublic(publicId: string): Promise<PublicEventView | null>;
}

export interface RegistrationAnswerInput {
  fieldId: string;
  value: unknown;
}

export interface EventRegistrationRepository {
  signUpAndRegister(input: {
    event: PublicEventView;
    name: string;
    email: string;
    passwordHash: string;
    answers: RegistrationAnswerInput[];
    profile?: MemberProfileDraft;
    participants: RegistrationParticipantSnapshot[];
    offeringIds: string[];
  }): Promise<{ identity: LoginIdentity; registrationId: string }>;
  register(input: {
    principal: AuthenticatedPrincipal;
    event: PublicEventView;
    answers: RegistrationAnswerInput[];
    profile?: MemberProfileDraft;
    participants: RegistrationParticipantSnapshot[];
    offeringIds: string[];
  }): Promise<string>;
  context(principal: AuthenticatedPrincipal, event: PublicEventView): Promise<RegistrationContextView>;
}

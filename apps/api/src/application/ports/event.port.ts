import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { EventDraft, EventFormField, EventStatus } from '../../domain/entities/event';
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
}

export interface DashboardView {
  community: { id: string; name: string };
  user: Pick<AuthenticatedPrincipal, 'userId' | 'name' | 'email' | 'roles' | 'permissions'>;
  events: DashboardEvent[];
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
  fields: Required<Pick<EventFormField, 'id'>>[] & EventFormField[];
}

export interface EventRepository {
  dashboard(principal: AuthenticatedPrincipal): Promise<DashboardView>;
  list(principal: AuthenticatedPrincipal): Promise<DashboardEvent[]>;
  create(principal: AuthenticatedPrincipal, draft: EventDraft): Promise<DashboardEvent>;
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
  }): Promise<{ identity: LoginIdentity; registrationId: string }>;
  register(input: {
    principal: AuthenticatedPrincipal;
    event: PublicEventView;
    answers: RegistrationAnswerInput[];
  }): Promise<string>;
}

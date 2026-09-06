import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PERMISSIONS } from '../../domain/entities/permission';
import { AuthorizationError } from './errors';
import type { PasswordHasher, SessionClientContext, SessionRepository, SessionSecurity, TokenService } from '../ports/authentication.port';
import type { EventRegistrationRepository, RegistrationAnswerInput } from '../ports/event.port';
import { GetPublicEventUseCase, validateAnswers } from './event.use-cases';
import { MemberProfileDraft } from '../../domain/entities/member-profile';
import { EventRegistrationSelection } from '../../domain/entities/event-registration';

type ProgressiveProfileInput = Parameters<typeof MemberProfileDraft.create>[0];

function prepareRegistration(event: Awaited<ReturnType<GetPublicEventUseCase['resolve']>>, registrantName: string, input: {
  profile?: ProgressiveProfileInput; participantKeys?: string[]; offeringIds?: string[];
}) {
  const profile = event.familyRegistrationEnabled ? MemberProfileDraft.create(input.profile ?? {}) : undefined;
  const selection = EventRegistrationSelection.create({
    registrantName,
    familyRegistrationEnabled: event.familyRegistrationEnabled,
    profile,
    participantKeys: input.participantKeys,
    offeringIds: input.offeringIds,
    availableOfferingIds: event.offerings.map((offering) => offering.id),
  });
  return { profile, ...selection.props };
}

export class SignUpForEventUseCase {
  constructor(
    private readonly publicEvents: GetPublicEventUseCase,
    private readonly registrations: EventRegistrationRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionRepository,
    private readonly sessionSecurity: SessionSecurity,
  ) {}

  async execute(input: {
    publicId: string; name: string; email: string; password: string; answers: RegistrationAnswerInput[];
    profile?: ProgressiveProfileInput; participantKeys?: string[]; offeringIds?: string[];
  }, context: SessionClientContext) {
    const event = await this.publicEvents.resolve(input.publicId);
    validateAnswers(event.fields, input.answers);
    const progressive = prepareRegistration(event, input.name, input);
    const result = await this.registrations.signUpAndRegister({
      event,
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      passwordHash: await this.passwords.hash(input.password),
      answers: input.answers,
      ...progressive,
    });
    const principal: AuthenticatedPrincipal = {
      userId: result.identity.userId,
      tenantId: result.identity.tenantId,
      name: result.identity.name,
      email: result.identity.email,
      roles: result.identity.roles,
      permissions: result.identity.permissions,
    };
    const issued = this.sessionSecurity.issue(context);
    principal.sessionId = await this.sessions.create(principal, issued);
    return { registrationId: result.registrationId, accessToken: await this.tokens.sign(principal), sessionProof: issued.proof, user: principal };
  }
}

export class RegisterForEventUseCase {
  constructor(
    private readonly publicEvents: GetPublicEventUseCase,
    private readonly registrations: EventRegistrationRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal, publicId: string, input: {
    answers: RegistrationAnswerInput[]; profile?: ProgressiveProfileInput; participantKeys?: string[]; offeringIds?: string[];
  }) {
    if (!principal.permissions.includes(PERMISSIONS.eventsRegister)) {
      throw new AuthorizationError('Você não tem permissão para confirmar inscrição em eventos.');
    }
    const event = await this.publicEvents.resolve(publicId);
    if (principal.tenantId !== event.tenantId) throw new Error('Esta conta pertence a outra comunidade.');
    validateAnswers(event.fields, input.answers);
    return { registrationId: await this.registrations.register({ principal, event, answers: input.answers, ...prepareRegistration(event, principal.name, input) }) };
  }
}

export class GetEventRegistrationContextUseCase {
  constructor(
    private readonly publicEvents: GetPublicEventUseCase,
    private readonly registrations: EventRegistrationRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal, publicId: string) {
    if (!principal.permissions.includes(PERMISSIONS.eventsRegister)) throw new AuthorizationError('Você não tem permissão para confirmar inscrição em eventos.');
    const event = await this.publicEvents.resolve(publicId);
    if (principal.tenantId !== event.tenantId) throw new Error('Esta conta pertence a outra comunidade.');
    return this.registrations.context(principal, event);
  }
}

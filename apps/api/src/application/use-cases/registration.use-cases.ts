import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PERMISSIONS } from '../../domain/entities/permission';
import { AuthorizationError } from './errors';
import type { PasswordHasher, SessionRepository, TokenService } from '../ports/authentication.port';
import type { EventRegistrationRepository, RegistrationAnswerInput } from '../ports/event.port';
import { GetPublicEventUseCase, validateAnswers } from './event.use-cases';

export class SignUpForEventUseCase {
  constructor(
    private readonly publicEvents: GetPublicEventUseCase,
    private readonly registrations: EventRegistrationRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(input: { publicId: string; name: string; email: string; password: string; answers: RegistrationAnswerInput[] }) {
    const event = await this.publicEvents.resolve(input.publicId);
    validateAnswers(event.fields, input.answers);
    const result = await this.registrations.signUpAndRegister({
      event,
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      passwordHash: await this.passwords.hash(input.password),
      answers: input.answers,
    });
    const principal: AuthenticatedPrincipal = {
      userId: result.identity.userId,
      tenantId: result.identity.tenantId,
      name: result.identity.name,
      email: result.identity.email,
      roles: result.identity.roles,
      permissions: result.identity.permissions,
    };
    principal.sessionId = await this.sessions.create(principal);
    return { registrationId: result.registrationId, accessToken: await this.tokens.sign(principal), user: principal };
  }
}

export class RegisterForEventUseCase {
  constructor(
    private readonly publicEvents: GetPublicEventUseCase,
    private readonly registrations: EventRegistrationRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal, publicId: string, answers: RegistrationAnswerInput[]) {
    if (!principal.permissions.includes(PERMISSIONS.eventsRegister)) {
      throw new AuthorizationError('Você não tem permissão para confirmar inscrição em eventos.');
    }
    const event = await this.publicEvents.resolve(publicId);
    if (principal.tenantId !== event.tenantId) throw new Error('Esta conta pertence a outra comunidade.');
    validateAnswers(event.fields, answers);
    return { registrationId: await this.registrations.register({ principal, event, answers }) };
  }
}

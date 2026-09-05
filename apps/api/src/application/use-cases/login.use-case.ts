import type { AuthenticationRepository, PasswordHasher, SessionClientContext, SessionRepository, SessionSecurity, TokenService } from '../ports/authentication.port';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { AuthenticationError } from './errors';

export class LoginUseCase {
  constructor(
    private readonly authentication: AuthenticationRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionRepository,
    private readonly sessionSecurity: SessionSecurity,
  ) {}

  async execute(input: { tenantSlug: string; email: string; password: string }, context: SessionClientContext) {
    const identity = await this.authentication.findForLogin(input.tenantSlug, input.email.toLowerCase().trim());
    return this.authenticate(identity, input.password, context);
  }

  async executeForTenant(input: { tenantId: string; email: string; password: string }, context: SessionClientContext) {
    const identity = await this.authentication.findForTenantLogin(input.tenantId, input.email.toLowerCase().trim());
    return this.authenticate(identity, input.password, context);
  }

  private async authenticate(identity: Awaited<ReturnType<AuthenticationRepository['findForLogin']>>, password: string, context: SessionClientContext) {
    if (!identity?.passwordHash || !(await this.passwords.verify(password, identity.passwordHash))) {
      throw new AuthenticationError('Credenciais inválidas.');
    }
    const principal: AuthenticatedPrincipal = {
      userId: identity.userId,
      tenantId: identity.tenantId,
      name: identity.name,
      email: identity.email,
      roles: identity.roles,
      permissions: identity.permissions,
    };
    const issued = this.sessionSecurity.issue(context);
    principal.sessionId = await this.sessions.create(principal, issued);
    return { accessToken: await this.tokens.sign(principal), sessionProof: issued.proof, user: principal };
  }
}

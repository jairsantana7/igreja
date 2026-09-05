import type { SessionRepository } from '../ports/authentication.port';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import { AuthorizationError } from './errors';

function authorize(principal: AuthenticatedPrincipal) {
  if (!principal.permissions.includes(PERMISSIONS.sessionsManage)) {
    throw new AuthorizationError('Você não tem permissão para gerenciar sessões.');
  }
}

export class ListSessionsUseCase {
  constructor(private readonly sessions: SessionRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    authorize(principal);
    return this.sessions.list(principal);
  }
}

export class RevokeOtherSessionsUseCase {
  constructor(private readonly sessions: SessionRepository) {}
  async execute(principal: AuthenticatedPrincipal) {
    authorize(principal);
    return { revoked: await this.sessions.revokeOthers(principal) };
  }
}

export class RevokeCurrentSessionUseCase {
  constructor(private readonly sessions: SessionRepository) {}
  async execute(principal: AuthenticatedPrincipal) {
    return { revoked: await this.sessions.revokeCurrent(principal) };
  }
}

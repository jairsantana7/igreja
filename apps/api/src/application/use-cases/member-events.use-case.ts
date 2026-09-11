import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { MemberEventRepository } from '../ports/event.port';
import { AuthorizationError } from './errors';

export class ListMemberEventsUseCase {
  constructor(private readonly events: MemberEventRepository) {}

  execute(principal: AuthenticatedPrincipal) {
    if (!principal.permissions.includes(PERMISSIONS.memberEventsRead)) {
      throw new AuthorizationError('Você não tem permissão para consultar os eventos do membro.');
    }
    return this.events.listForMember(principal);
  }
}

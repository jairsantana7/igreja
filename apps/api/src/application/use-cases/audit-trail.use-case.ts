import type { AuditTrailRepository } from '../ports/audit-trail.port';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import { AuthorizationError } from './errors';

export class ListAuditEventsUseCase {
  constructor(private readonly audit: AuditTrailRepository) {}
  execute(principal: AuthenticatedPrincipal) {
    if (!principal.permissions.includes(PERMISSIONS.auditRead)) {
      throw new AuthorizationError('Você não tem permissão para visualizar a auditoria.');
    }
    return this.audit.list(principal, 100);
  }
}

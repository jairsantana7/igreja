import type { AuthenticatedPrincipal } from '../../domain/entities/permission';

export interface AuditEventView {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: 'created' | 'updated' | 'deleted';
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export interface AuditTrailRepository {
  list(principal: AuthenticatedPrincipal, limit: number): Promise<AuditEventView[]>;
}

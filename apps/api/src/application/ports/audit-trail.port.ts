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

export interface AuditCursor {
  createdAt: string;
  id: string;
}

export interface AuditTrailQuery {
  limit: number;
  eventId?: string;
  action?: AuditEventView['action'];
  cursor?: AuditCursor;
}

export interface AuditEventPage {
  items: AuditEventView[];
  nextCursor: string | null;
}

export interface AuditTrailRepository {
  list(principal: AuthenticatedPrincipal, query: AuditTrailQuery): Promise<AuditEventView[]>;
}

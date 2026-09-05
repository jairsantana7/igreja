import type { AuditEventView, AuditTrailRepository } from '../../application/ports/audit-trail.port';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresAuditTrailRepository implements AuditTrailRepository {
  constructor(private readonly database: PostgresDatabase) {}

  list(principal: AuthenticatedPrincipal, limit: number): Promise<AuditEventView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{
        id: string;
        actor_user_id: string | null;
        actor_name: string | null;
        action: AuditEventView['action'];
        resource_type: string;
        resource_id: string;
        created_at: Date;
      }>(`
        SELECT id, actor_user_id, actor_name, action, resource_type, resource_id, created_at
        FROM audit_events
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `, [Math.min(Math.max(limit, 1), 100)]);
      return result.rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        createdAt: row.created_at.toISOString(),
      }));
    });
  }
}

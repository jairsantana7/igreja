import type { SessionRepository, SessionVerification, SessionView } from '../../application/ports/authentication.port';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly database: PostgresDatabase) {}

  create(principal: AuthenticatedPrincipal, verification: SessionVerification): Promise<string> {
    return this.database.withTenant(principal, async (client) => {
      const id = crypto.randomUUID();
      await client.query(`
        INSERT INTO auth_sessions (id, tenant_id, user_id, expires_at, proof_hash, user_agent_hash)
        VALUES ($1, $2, $3, now() + interval '8 hours', $4, $5)
      `, [id, principal.tenantId, principal.userId, verification.proofHash, verification.userAgentHash]);
      return id;
    });
  }

  isActive(principal: AuthenticatedPrincipal, verification: SessionVerification): Promise<boolean> {
    if (!principal.sessionId) return Promise.resolve(false);
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        SELECT 1 FROM auth_sessions
        WHERE id = $1 AND user_id = $2
          AND proof_hash = $3 AND user_agent_hash = $4
          AND revoked_at IS NULL AND expires_at > now()
      `, [principal.sessionId, principal.userId, verification.proofHash, verification.userAgentHash]);
      return Boolean(result.rowCount);
    });
  }

  list(principal: AuthenticatedPrincipal): Promise<SessionView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{ id: string; created_at: Date; expires_at: Date }>(`
        SELECT id, created_at, expires_at FROM auth_sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
      `, [principal.userId]);
      return result.rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        current: row.id === principal.sessionId,
      }));
    });
  }

  revokeOthers(principal: AuthenticatedPrincipal): Promise<number> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        UPDATE auth_sessions SET revoked_at = now()
        WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
      `, [principal.userId, principal.sessionId]);
      return result.rowCount ?? 0;
    });
  }

  revokeCurrent(principal: AuthenticatedPrincipal): Promise<boolean> {
    if (!principal.sessionId) return Promise.resolve(false);
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        UPDATE auth_sessions SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      `, [principal.sessionId, principal.userId]);
      return Boolean(result.rowCount);
    });
  }
}

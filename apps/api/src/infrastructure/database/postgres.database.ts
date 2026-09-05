import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PostgresDatabase implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'igreja-api',
  });

  queryPublic<T extends QueryResultRow>(text: string, values: unknown[] = []) {
    return this.pool.query<T>(text, values);
  }

  async withTenant<T>(context: string | { tenantId: string; userId?: string }, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const tenantId = typeof context === 'string' ? context : context.tenantId;
    const actorUserId = typeof context === 'string' ? '' : context.userId ?? '';
    if (!UUID_PATTERN.test(tenantId)) throw new Error('Contexto de tenant inválido.');
    if (actorUserId && !UUID_PATTERN.test(actorUserId)) throw new Error('Contexto de ator inválido.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.actor_user_id', $1, true)", [actorUserId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

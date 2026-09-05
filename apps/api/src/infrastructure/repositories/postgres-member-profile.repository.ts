import type { PoolClient } from 'pg';
import type { MemberProfileRepository, MemberProfileView } from '../../application/ports/member-profile.port';
import type { MemberProfileDraft } from '../../domain/entities/member-profile';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresMemberProfileRepository implements MemberProfileRepository {
  constructor(private readonly database: PostgresDatabase) {}

  find(principal: AuthenticatedPrincipal, memberId: string): Promise<MemberProfileView | null> {
    return this.database.withTenant(principal, (client) => this.findWithClient(client, memberId));
  }

  save(principal: AuthenticatedPrincipal, memberId: string, draft: MemberProfileDraft): Promise<MemberProfileView | null> {
    return this.database.withTenant(principal, async (client) => {
      if (!(await client.query('SELECT 1 FROM users WHERE id = $1', [memberId])).rowCount) return null;
      const address = draft.props.address;
      const profile = await client.query<{ id: string }>(`
        INSERT INTO member_profiles (
          tenant_id, user_id, birth_date, postal_code, street, address_number, complement,
          neighborhood, city, state, updated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (user_id, tenant_id) DO UPDATE SET
          birth_date = EXCLUDED.birth_date,
          postal_code = EXCLUDED.postal_code,
          street = EXCLUDED.street,
          address_number = EXCLUDED.address_number,
          complement = EXCLUDED.complement,
          neighborhood = EXCLUDED.neighborhood,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now()
        RETURNING id
      `, [
        principal.tenantId, memberId, draft.props.birthDate ?? null, address.postalCode ?? null, address.street ?? null,
        address.number ?? null, address.complement ?? null, address.neighborhood ?? null,
        address.city ?? null, address.state ?? null, principal.userId,
      ]);
      const profileId = profile.rows[0]!.id;
      await client.query('DELETE FROM member_children WHERE profile_id = $1', [profileId]);
      for (const child of draft.props.children) {
        await client.query(`
          INSERT INTO member_children (tenant_id, profile_id, member_user_id, name, birth_date)
          VALUES ($1, $2, $3, $4, $5)
        `, [principal.tenantId, profileId, memberId, child.name, child.birthDate ?? null]);
      }
      return this.findWithClient(client, memberId);
    });
  }

  private async findWithClient(client: PoolClient, memberId: string): Promise<MemberProfileView | null> {
    const result = await client.query<{
      id: string; name: string; email: string; birth_date: string | null; postal_code: string | null; street: string | null;
      address_number: string | null; complement: string | null; neighborhood: string | null;
      city: string | null; state: string | null; updated_at: Date | null;
      children: Array<{ id: string; name: string; birthDate: string | null }>;
    }>(`
      SELECT users.id, users.name, users.email, to_char(profiles.birth_date, 'YYYY-MM-DD') AS birth_date,
        profiles.postal_code, profiles.street, profiles.address_number, profiles.complement,
        profiles.neighborhood, profiles.city, profiles.state, profiles.updated_at,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', children.id, 'name', children.name, 'birthDate', children.birth_date
          ) ORDER BY children.name, children.id)
          FROM member_children AS children
          WHERE children.profile_id = profiles.id AND children.member_user_id = users.id
        ), '[]'::jsonb) AS children
      FROM users
      LEFT JOIN member_profiles AS profiles
        ON profiles.user_id = users.id AND profiles.tenant_id = users.tenant_id
      WHERE users.id = $1
    `, [memberId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      member: { id: row.id, name: row.name, email: row.email },
      birthDate: row.birth_date,
      address: {
        postalCode: row.postal_code, street: row.street, number: row.address_number,
        complement: row.complement, neighborhood: row.neighborhood, city: row.city, state: row.state,
      },
      hasChildren: row.children.length > 0,
      children: row.children,
      updatedAt: row.updated_at?.toISOString() ?? null,
    };
  }
}

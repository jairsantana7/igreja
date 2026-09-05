import type { MemberOnboardingRepository } from '../../application/ports/member-onboarding.port';
import { ConflictError } from '../../application/use-cases/errors';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PostgresDatabase } from '../database/postgres.database';

export class PostgresMemberOnboardingRepository implements MemberOnboardingRepository {
  constructor(private readonly database: PostgresDatabase) {}

  create(principal: AuthenticatedPrincipal, input: Parameters<MemberOnboardingRepository['create']>[1]) {
    return this.database.withTenant(principal, async (client) => {
      const roles = await client.query<{ id: string }>('SELECT id FROM roles WHERE id = ANY($1::uuid[])', [input.roleIds]);
      if (roles.rowCount !== new Set(input.roleIds).size) throw new ConflictError('Um ou mais papéis não pertencem à comunidade.');
      try {
        const user = await client.query<{ id: string; name: string; email: string }>(`
          INSERT INTO users (tenant_id, name, email, password_hash) VALUES ($1, $2, $3, $4)
          RETURNING id, name, email
        `, [principal.tenantId, input.name, input.email, input.passwordHash]);
        const member = user.rows[0]!;
        for (const role of roles.rows) {
          await client.query('INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)', [
            principal.tenantId, member.id, role.id,
          ]);
        }
        if (input.profile && !input.profile.isEmpty) {
          const address = input.profile.props.address;
          const profile = await client.query<{ id: string }>(`
            INSERT INTO member_profiles (
              tenant_id, user_id, birth_date, postal_code, street, address_number, complement,
              neighborhood, city, state, updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
          `, [
            principal.tenantId, member.id, input.profile.props.birthDate ?? null,
            address.postalCode ?? null, address.street ?? null, address.number ?? null,
            address.complement ?? null, address.neighborhood ?? null, address.city ?? null,
            address.state ?? null, principal.userId,
          ]);
          for (const child of input.profile.props.children) {
            await client.query(`
              INSERT INTO member_children (tenant_id, profile_id, member_user_id, name, birth_date)
              VALUES ($1, $2, $3, $4, $5)
            `, [principal.tenantId, profile.rows[0]!.id, member.id, child.name, child.birthDate ?? null]);
          }
        }
        return member;
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe um usuário com este e-mail.');
        throw error;
      }
    });
  }
}

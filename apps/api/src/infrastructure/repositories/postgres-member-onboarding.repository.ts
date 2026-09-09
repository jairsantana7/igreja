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
              tenant_id, user_id, phone, birth_date, postal_code, street, address_number, complement,
              neighborhood, city, state, updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `, [
            principal.tenantId, member.id, input.profile.props.phone ?? null, input.profile.props.birthDate ?? null,
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

  createFromConversation(principal: AuthenticatedPrincipal, input: Parameters<MemberOnboardingRepository['createFromConversation']>[1]) {
    return this.database.withTenant(principal, async (client) => {
      const conversationResult = await client.query<{
        id: string;
        contact_name: string;
        contact_address: string;
        member_user_id: string | null;
      }>(`
        SELECT conversations.id, conversations.contact_name, conversations.contact_address, conversations.member_user_id
        FROM conversations
        JOIN conversation_channels AS channels
          ON channels.id = conversations.channel_id AND channels.tenant_id = conversations.tenant_id
        WHERE conversations.id = $1
          AND ($2::boolean OR conversations.assigned_user_id = $3 OR channels.owner_user_id = $3)
        FOR UPDATE OF conversations
      `, [input.conversationId, principal.permissions.includes('conversations.read_all'), principal.userId]);
      const conversation = conversationResult.rows[0];
      if (!conversation) return null;
      if (conversation.member_user_id) throw new ConflictError('Esta conversa já está vinculada a um membro.');

      const rawAddress = conversation.contact_address.trim();
      if (rawAddress.toLowerCase().endsWith('@lid')) {
        throw new ConflictError('O número deste contato ainda não foi identificado pelo WhatsApp. Aguarde a sincronização e tente novamente.');
      }
      const phoneDigits = rawAddress.split('@')[0]!.replace(/\D/g, '');
      if (phoneDigits.length < 8 || phoneDigits.length > 15) {
        throw new ConflictError('A conversa não possui um número de WhatsApp válido para o cadastro.');
      }

      const memberRole = await client.query<{ id: string }>(`
        SELECT id FROM roles WHERE key = 'member' AND is_system LIMIT 1
      `);
      if (!memberRole.rows[0]) throw new ConflictError('O papel de membro não está configurado nesta comunidade.');

      try {
        const user = await client.query<{ id: string; name: string; email: string }>(`
          INSERT INTO users (tenant_id, name, email, password_hash)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, email
        `, [principal.tenantId, conversation.contact_name.trim(), input.email, input.passwordHash]);
        const member = user.rows[0]!;
        await client.query(`
          INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)
        `, [principal.tenantId, member.id, memberRole.rows[0].id]);
        await client.query(`
          INSERT INTO member_profiles (
            tenant_id, user_id, phone, whatsapp_communication_opt_in, updated_by_user_id
          ) VALUES ($1, $2, $3, false, $4)
        `, [principal.tenantId, member.id, `+${phoneDigits}`, principal.userId]);
        await client.query(`
          UPDATE conversations SET member_user_id = $2, updated_at = now() WHERE id = $1
        `, [conversation.id, member.id]);
        await client.query(`
          UPDATE pastoral_followups AS followups
          SET member_user_id = $2, updated_at = now()
          FROM followup_conversations AS links
          WHERE links.followup_id = followups.id
            AND links.tenant_id = followups.tenant_id
            AND links.conversation_id = $1
        `, [conversation.id, member.id]);
        return member;
      } catch (error: any) {
        if (error?.code === '23505') throw new ConflictError('Já existe um usuário com este e-mail. O vínculo com membros existentes ainda precisa de um fluxo próprio.');
        throw error;
      }
    });
  }
}

import type { MemberOnboardingDeliveryView, MemberOnboardingRepository } from '../../application/ports/member-onboarding.port';
import { ConflictError } from '../../application/use-cases/errors';
import type { AuthenticatedPrincipal } from '../../domain/entities/permission';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { PostgresDatabase } from '../database/postgres.database';
import type { PoolClient } from 'pg';
import { identityUniqueConflict, withIdentityUniqueConflict } from './postgres-identity-errors';

export class PostgresMemberOnboardingRepository implements MemberOnboardingRepository {
  constructor(private readonly database: PostgresDatabase) {}

  create(principal: AuthenticatedPrincipal, input: Parameters<MemberOnboardingRepository['create']>[1]) {
    return this.database.withTenant(principal, async (client) => {
      const roles = await client.query<{ id: string }>('SELECT id FROM roles WHERE id = ANY($1::uuid[])', [input.roleIds]);
      if (roles.rowCount !== new Set(input.roleIds).size) throw new ConflictError('Um ou mais papéis não pertencem à comunidade.');
      try {
        const user = await client.query<{ id: string; name: string; email: string }>(`
          INSERT INTO users (tenant_id, name, email, password_hash, temporary_password_expires_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, email
        `, [principal.tenantId, input.name, input.email, input.passwordHash, input.delivery.expiresAt]);
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
        const delivery = await this.insertDelivery(client, principal, member.id, input.delivery);
        return { ...member, delivery };
      } catch (error: any) {
        const conflict = identityUniqueConflict(error, 'Já existe um usuário com este e-mail.');
        if (conflict) throw conflict;
        throw error;
      }
    });
  }

  createFromConversation(principal: AuthenticatedPrincipal, input: Parameters<MemberOnboardingRepository['createFromConversation']>[1]) {
    return this.database.withTenant(principal, async (client) => {
      const conversationResult = await client.query<{
        id: string;
        contact_address: string;
        member_user_id: string | null;
      }>(`
        SELECT conversations.id, conversations.contact_address, conversations.member_user_id
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
          INSERT INTO users (tenant_id, name, email, password_hash, temporary_password_expires_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, email
        `, [principal.tenantId, input.name, input.email, input.passwordHash, input.delivery.expiresAt]);
        const member = user.rows[0]!;
        await client.query(`
          INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)
        `, [principal.tenantId, member.id, memberRole.rows[0].id]);
        await client.query(`
          INSERT INTO member_profiles (
            tenant_id, user_id, phone, phone_verified_at, whatsapp_communication_opt_in, updated_by_user_id
          ) VALUES ($1, $2, $3, now(), false, $4)
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
        const delivery = await this.insertDelivery(client, principal, member.id, {
          ...input.delivery,
          phone: `+${phoneDigits}`,
        });
        return { ...member, delivery };
      } catch (error: any) {
        const conflict = identityUniqueConflict(error, 'Já existe um usuário com este e-mail. O vínculo com membros existentes ainda precisa de um fluxo próprio.');
        if (conflict) throw conflict;
        throw error;
      }
    });
  }

  listDeliveries(principal: AuthenticatedPrincipal): Promise<MemberOnboardingDeliveryView[]> {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query(`
        SELECT deliveries.id, deliveries.member_user_id, deliveries.phone, deliveries.status,
          deliveries.expires_at, deliveries.revealed_at, deliveries.delivered_at,
          deliveries.completed_at, deliveries.created_at,
          users.name AS member_name, users.email AS member_email
        FROM member_onboarding_deliveries AS deliveries
        JOIN users ON users.id = deliveries.member_user_id AND users.tenant_id = deliveries.tenant_id
        ORDER BY CASE deliveries.status
          WHEN 'pending' THEN 0 WHEN 'revealed' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END,
          deliveries.created_at DESC, deliveries.id DESC
      `);
      return result.rows.map((row) => this.mapDelivery(row));
    });
  }

  findDeliverySecret(principal: AuthenticatedPrincipal, deliveryId: string) {
    return this.database.withTenant(principal, async (client) => {
      const result = await client.query<{
        encrypted_payload: Buffer | null;
        status: MemberOnboardingDeliveryView['status'];
        expires_at: Date;
      }>(`
        SELECT encrypted_payload, status, expires_at
        FROM member_onboarding_deliveries
        WHERE id = $1
      `, [deliveryId]);
      const row = result.rows[0];
      return row?.encrypted_payload ? {
        encryptedPayload: row.encrypted_payload,
        status: row.status,
        expiresAt: row.expires_at,
      } : null;
    });
  }

  markDeliveryRevealed(principal: AuthenticatedPrincipal, deliveryId: string): Promise<MemberOnboardingDeliveryView | null> {
    return this.database.withTenant(principal, async (client) => {
      const changed = await client.query(`
        UPDATE member_onboarding_deliveries
        SET status = CASE WHEN status = 'pending' THEN 'revealed' ELSE status END,
          revealed_at = COALESCE(revealed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'revealed', 'delivered')
          AND expires_at > now() AND encrypted_payload IS NOT NULL
        RETURNING id
      `, [deliveryId]);
      return changed.rowCount ? this.findDeliveryWithClient(client, deliveryId) : null;
    });
  }

  markDeliveryDelivered(principal: AuthenticatedPrincipal, deliveryId: string): Promise<MemberOnboardingDeliveryView | null> {
    return this.database.withTenant(principal, async (client) => {
      const changed = await client.query(`
        UPDATE member_onboarding_deliveries
        SET status = 'delivered', delivered_at = COALESCE(delivered_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'revealed', 'delivered')
          AND expires_at > now() AND encrypted_payload IS NOT NULL
        RETURNING id
      `, [deliveryId]);
      return changed.rowCount ? this.findDeliveryWithClient(client, deliveryId) : null;
    });
  }

  revokeDelivery(principal: AuthenticatedPrincipal, deliveryId: string): Promise<MemberOnboardingDeliveryView | null> {
    return this.database.withTenant(principal, async (client) => {
      const changed = await client.query<{ member_user_id: string }>(`
        UPDATE member_onboarding_deliveries
        SET status = 'revoked', encrypted_payload = NULL, updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'revealed', 'delivered')
        RETURNING member_user_id
      `, [deliveryId]);
      if (changed.rows[0]) {
        await client.query(`
          UPDATE users SET password_hash = NULL, temporary_password_expires_at = NULL, updated_at = now()
          WHERE id = $1
        `, [changed.rows[0].member_user_id]);
      }
      return changed.rowCount ? this.findDeliveryWithClient(client, deliveryId) : null;
    });
  }

  async resolvePublicDelivery(deliveryId: string, tokenHash: string) {
    const resolved = await this.database.queryPublic<{ tenant_id: string | null }>(
      'SELECT app.resolve_member_onboarding_tenant($1) AS tenant_id',
      [deliveryId],
    );
    const tenantId = resolved.rows[0]?.tenant_id;
    if (!tenantId) return null;
    return this.database.withTenant(tenantId, async (client) => {
      const result = await client.query<{
        member_user_id: string;
        member_name: string;
        member_email: string;
        phone: string;
        expires_at: Date;
      }>(`
        SELECT deliveries.member_user_id, users.name AS member_name, users.email AS member_email,
          deliveries.phone, deliveries.expires_at
        FROM member_onboarding_deliveries AS deliveries
        JOIN users ON users.id = deliveries.member_user_id AND users.tenant_id = deliveries.tenant_id
        WHERE deliveries.id = $1 AND deliveries.token_hash = $2
          AND deliveries.status IN ('pending', 'revealed', 'delivered')
          AND deliveries.expires_at > now() AND deliveries.encrypted_payload IS NOT NULL
      `, [deliveryId, tokenHash]);
      const row = result.rows[0];
      return row ? {
        tenantId,
        deliveryId,
        member: { id: row.member_user_id, name: row.member_name, email: row.member_email },
        phone: row.phone,
        expiresAt: row.expires_at.toISOString(),
      } : null;
    });
  }

  completePublicDelivery(input: Parameters<MemberOnboardingRepository['completePublicDelivery']>[0]): Promise<boolean> {
    return withIdentityUniqueConflict(this.database.withTenant({ tenantId: input.tenantId, userId: input.memberUserId }, async (client) => {
      const locked = await client.query<{ member_user_id: string; phone: string }>(`
        SELECT member_user_id, phone FROM member_onboarding_deliveries
        WHERE id = $1 AND token_hash = $2 AND member_user_id = $3
          AND status IN ('pending', 'revealed', 'delivered')
          AND expires_at > now() AND encrypted_payload IS NOT NULL
        FOR UPDATE
      `, [input.deliveryId, input.tokenHash, input.memberUserId]);
      if (!locked.rows[0]) return false;

      const draft = input.profile;
      const address = draft.props.address;
      const phoneVerified = Boolean(draft.props.phone)
        && draft.props.phone === PhoneNumber.create(locked.rows[0].phone).value;
      await client.query(`
        UPDATE users SET password_hash = $2, temporary_password_expires_at = NULL, updated_at = now()
        WHERE id = $1
      `, [input.memberUserId, input.passwordHash]);
      const profile = await client.query<{ id: string }>(`
        INSERT INTO member_profiles (
          tenant_id, user_id, phone, phone_verified_at, birth_date, spouse_name, marriage_date,
          postal_code, street, address_number, complement, neighborhood, city, state,
          whatsapp_communication_opt_in, whatsapp_communication_opted_in_at, updated_by_user_id
        ) VALUES ($1, $2, $3, CASE WHEN $15 THEN now() ELSE NULL END, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          CASE WHEN $14 THEN now() ELSE NULL END, $2)
        ON CONFLICT (user_id, tenant_id) DO UPDATE SET
          phone = EXCLUDED.phone,
          phone_verified_at = CASE
            WHEN $15 THEN now()
            WHEN member_profiles.phone IS DISTINCT FROM EXCLUDED.phone THEN NULL
            ELSE member_profiles.phone_verified_at
          END,
          birth_date = EXCLUDED.birth_date,
          spouse_name = EXCLUDED.spouse_name, marriage_date = EXCLUDED.marriage_date,
          postal_code = EXCLUDED.postal_code, street = EXCLUDED.street,
          address_number = EXCLUDED.address_number, complement = EXCLUDED.complement,
          neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city, state = EXCLUDED.state,
          whatsapp_communication_opt_in = $14,
          whatsapp_communication_opted_in_at = CASE WHEN $14 THEN COALESCE(member_profiles.whatsapp_communication_opted_in_at, now()) ELSE member_profiles.whatsapp_communication_opted_in_at END,
          whatsapp_communication_opted_out_at = CASE WHEN NOT $14 AND member_profiles.whatsapp_communication_opt_in THEN now() ELSE member_profiles.whatsapp_communication_opted_out_at END,
          updated_by_user_id = $2, updated_at = now()
        RETURNING id
      `, [
        input.tenantId, input.memberUserId, draft.props.phone ?? null, draft.props.birthDate ?? null,
        draft.props.spouseName ?? null, draft.props.marriageDate ?? null,
        address.postalCode ?? null, address.street ?? null, address.number ?? null,
        address.complement ?? null, address.neighborhood ?? null, address.city ?? null,
        address.state ?? null, draft.props.whatsappCommunicationOptIn ?? false, phoneVerified,
      ]);
      await client.query('DELETE FROM member_children WHERE profile_id = $1', [profile.rows[0]!.id]);
      for (const child of draft.props.children) {
        await client.query(`
          INSERT INTO member_children (tenant_id, profile_id, member_user_id, name, birth_date)
          VALUES ($1, $2, $3, $4, $5)
        `, [input.tenantId, profile.rows[0]!.id, input.memberUserId, child.name, child.birthDate ?? null]);
      }
      await client.query(`
        UPDATE member_onboarding_deliveries
        SET status = 'completed', completed_at = now(), encrypted_payload = NULL, updated_at = now()
        WHERE id = $1
      `, [input.deliveryId]);
      return true;
    }));
  }

  private async insertDelivery(
    client: PoolClient,
    principal: AuthenticatedPrincipal,
    memberUserId: string,
    input: Parameters<MemberOnboardingRepository['create']>[1]['delivery'],
  ) {
    const result = await client.query<{ id: string; expires_at: Date }>(`
      INSERT INTO member_onboarding_deliveries (
        tenant_id, member_user_id, phone, token_hash, encrypted_payload, expires_at, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, expires_at
    `, [
      principal.tenantId, memberUserId, input.phone, input.tokenHash,
      input.encryptedPayload, input.expiresAt, principal.userId,
    ]);
    return { id: result.rows[0]!.id, expiresAt: result.rows[0]!.expires_at.toISOString() };
  }

  private async findDeliveryWithClient(client: PoolClient, deliveryId: string): Promise<MemberOnboardingDeliveryView | null> {
    const result = await client.query(`
      SELECT deliveries.id, deliveries.member_user_id, deliveries.phone, deliveries.status,
        deliveries.expires_at, deliveries.revealed_at, deliveries.delivered_at,
        deliveries.completed_at, deliveries.created_at,
        users.name AS member_name, users.email AS member_email
      FROM member_onboarding_deliveries AS deliveries
      JOIN users ON users.id = deliveries.member_user_id AND users.tenant_id = deliveries.tenant_id
      WHERE deliveries.id = $1
    `, [deliveryId]);
    return result.rows[0] ? this.mapDelivery(result.rows[0]) : null;
  }

  private mapDelivery(row: any): MemberOnboardingDeliveryView {
    const expired = row.expires_at <= new Date() && ['pending', 'revealed', 'delivered'].includes(row.status);
    return {
      id: row.id,
      member: { id: row.member_user_id, name: row.member_name, email: row.member_email },
      phone: row.phone,
      status: expired ? 'expired' : row.status,
      expiresAt: row.expires_at.toISOString(),
      revealedAt: row.revealed_at?.toISOString() ?? null,
      deliveredAt: row.delivered_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }
}

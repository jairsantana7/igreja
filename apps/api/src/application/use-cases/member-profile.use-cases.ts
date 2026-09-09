import { MemberProfileDraft } from '../../domain/entities/member-profile';
import { PERMISSIONS, type AuthenticatedPrincipal } from '../../domain/entities/permission';
import type { MemberProfileRepository } from '../ports/member-profile.port';
import type { ConversationRepository } from '../ports/conversation.port';
import { AuthorizationError, ConflictError, NotFoundError } from './errors';

export class GetMemberProfileUseCase {
  constructor(private readonly profiles: MemberProfileRepository) {}
  async execute(principal: AuthenticatedPrincipal, memberId: string) {
    if (!principal.permissions.includes(PERMISSIONS.memberProfilesRead)) throw new AuthorizationError('Você não tem permissão para visualizar perfis complementares.');
    const profile = await this.profiles.find(principal, memberId);
    if (!profile) throw new NotFoundError('Membro não encontrado nesta comunidade.');
    return profile;
  }
}

export class UpdateMemberProfileUseCase {
  constructor(private readonly profiles: MemberProfileRepository) {}
  async execute(principal: AuthenticatedPrincipal, memberId: string, input: Parameters<typeof MemberProfileDraft.create>[0]) {
    if (!principal.permissions.includes(PERMISSIONS.memberProfilesManage)) throw new AuthorizationError('Você não tem permissão para editar perfis complementares.');
    const profile = await this.profiles.save(principal, memberId, MemberProfileDraft.create(input));
    if (!profile) throw new NotFoundError('Membro não encontrado nesta comunidade.');
    return profile;
  }
}

export class GetMemberConversationUseCase {
  constructor(private readonly conversations: ConversationRepository) {}
  async execute(principal: AuthenticatedPrincipal, memberId: string) {
    if (!principal.permissions.includes(PERMISSIONS.conversationsRead)) {
      throw new AuthorizationError('Você não tem permissão para visualizar conversas.');
    }
    return { conversation: await this.conversations.findForMember(principal, memberId) };
  }
}

export class StartMemberConversationUseCase {
  constructor(
    private readonly profiles: MemberProfileRepository,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal, memberId: string, input: { channelId: string; eventId?: string }) {
    if (!principal.permissions.includes(PERMISSIONS.memberProfilesRead)
      || !principal.permissions.includes(PERMISSIONS.conversationsReply)) {
      throw new AuthorizationError('Você não tem permissão para iniciar conversas pelo perfil do membro.');
    }
    if (principal.permissions.includes(PERMISSIONS.conversationsRead)) {
      const existing = await this.conversations.findForMember(principal, memberId);
      if (existing) return existing;
    }
    const profile = await this.profiles.find(principal, memberId);
    if (!profile) throw new NotFoundError('Membro não encontrado nesta comunidade.');
    if (!profile.phone) throw new ConflictError('Este membro ainda não informou um WhatsApp.');
    if (!profile.whatsappCommunication.allowed) {
      throw new ConflictError('Este membro ainda não autorizou o início de conversas pelo WhatsApp.');
    }
    const conversation = await this.conversations.create(principal, {
      channelId: input.channelId,
      eventId: input.eventId,
      memberUserId: profile.member.id,
      contactName: profile.member.name,
      contactAddress: profile.phone,
    });
    if (!conversation) throw new NotFoundError('Canal ou evento não encontrado, ou sem acesso.');
    return conversation;
  }
}

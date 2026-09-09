import { describe, expect, it, vi } from 'vitest';
import { MemberProfileDraft } from '../src/domain/entities/member-profile';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import type { MemberProfileRepository } from '../src/application/ports/member-profile.port';
import type { ConversationRepository } from '../src/application/ports/conversation.port';
import { GetMemberConversationUseCase, GetMemberProfileUseCase, StartMemberConversationUseCase, UpdateMemberProfileUseCase } from '../src/application/use-cases/member-profile.use-cases';
import { AuthorizationError, ConflictError } from '../src/application/use-cases/errors';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Pastor', email: 'pastor@example.test', roles: ['pastor'], permissions,
});

describe('perfil complementar do membro', () => {
  it('mantém endereço e filhos opcionais e deriva a existência dos filhos no repositório', () => {
    const draft = MemberProfileDraft.create({ birthDate: '1988-05-10', address: { city: ' São Paulo ', state: 'sp' }, children: [{ name: ' Ana ', birthDate: '2020-01-02' }] });
    expect(draft.props).toEqual({
      phone: undefined,
      birthDate: '1988-05-10',
      spouseName: undefined,
      marriageDate: undefined,
      whatsappCommunicationOptIn: undefined,
      address: { postalCode: undefined, street: undefined, number: undefined, complement: undefined, neighborhood: undefined, city: 'São Paulo', state: 'SP' },
      children: [{ name: 'Ana', birthDate: '2020-01-02' }],
    });
  });

  it('rejeita nascimento futuro', () => {
    expect(() => MemberProfileDraft.create({ birthDate: '2999-01-01' })).toThrow('nascimento do membro');
    expect(() => MemberProfileDraft.create({ birthDate: '2020-02-31' })).toThrow('nascimento do membro');
    expect(() => MemberProfileDraft.create({ children: [{ name: 'Pessoa', birthDate: '2999-01-01' }] })).toThrow('data de nascimento');
    expect(() => MemberProfileDraft.create({ children: [{ name: 'Pessoa', birthDate: '2020-02-31' }] })).toThrow('data de nascimento');
  });

  it('identifica um perfil complementar sem dados', () => {
    expect(MemberProfileDraft.create({}).isEmpty).toBe(true);
    expect(MemberProfileDraft.create({ birthDate: '1990-01-01' }).isEmpty).toBe(false);
  });

  it('exige um número para autorizar conversas pelo WhatsApp', () => {
    expect(() => MemberProfileDraft.create({ whatsappCommunicationOptIn: true })).toThrow('Informe o WhatsApp');
    expect(MemberProfileDraft.create({ phone: '13999999999', whatsappCommunicationOptIn: true }).props.whatsappCommunicationOptIn).toBe(true);
  });

  it('separa permissões de perfil das permissões gerais de usuário', async () => {
    const find = vi.fn();
    const save = vi.fn();
    const get = new GetMemberProfileUseCase({ find } as unknown as MemberProfileRepository);
    const update = new UpdateMemberProfileUseCase({ save } as unknown as MemberProfileRepository);
    await expect(get.execute(principal(['users.read']), 'member')).rejects.toThrow(AuthorizationError);
    await expect(update.execute(principal(['users.update']), 'member', {})).rejects.toThrow(AuthorizationError);
    expect(find).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('inicia conversa usando os dados protegidos do perfil somente com autorização ativa', async () => {
    const profile = {
      member: { id: '20000000-0000-4000-8000-000000000002', name: 'Membro', email: 'membro@example.test' },
      phone: '+5513999999999',
      whatsappCommunication: { allowed: true, optedInAt: '2026-09-08T10:00:00.000Z', optedOutAt: null },
    };
    const find = vi.fn().mockResolvedValue(profile);
    const create = vi.fn().mockResolvedValue({ id: 'conversation' });
    const findForMember = vi.fn().mockResolvedValue(null);
    const useCase = new StartMemberConversationUseCase(
      { find } as unknown as MemberProfileRepository,
      { create, findForMember } as unknown as ConversationRepository,
    );
    await expect(useCase.execute(principal(['members.profile_read']), profile.member.id, { channelId: 'channel' }))
      .rejects.toThrow(AuthorizationError);
    await expect(useCase.execute(principal(['members.profile_read', 'conversations.read', 'conversations.reply']), profile.member.id, { channelId: 'channel' }))
      .resolves.toEqual({ id: 'conversation' });
    expect(create).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      memberUserId: profile.member.id,
      contactName: 'Membro',
      contactAddress: '+5513999999999',
    }));
  });

  it('bloqueia contato iniciado pela comunidade sem autorização do membro', async () => {
    const find = vi.fn().mockResolvedValue({
      member: { id: 'member', name: 'Membro', email: 'membro@example.test' },
      phone: '+5513999999999',
      whatsappCommunication: { allowed: false, optedInAt: null, optedOutAt: null },
    });
    const create = vi.fn();
    const findForMember = vi.fn().mockResolvedValue(null);
    const useCase = new StartMemberConversationUseCase(
      { find } as unknown as MemberProfileRepository,
      { create, findForMember } as unknown as ConversationRepository,
    );
    await expect(useCase.execute(principal(['members.profile_read', 'conversations.read', 'conversations.reply']), 'member', { channelId: 'channel' }))
      .rejects.toThrow(ConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it('abre uma conversa vinculada sem criar atendimento duplicado', async () => {
    const existing = { id: 'conversation-existing' };
    const findForMember = vi.fn().mockResolvedValue(existing);
    const find = vi.fn();
    const create = vi.fn();
    const useCase = new StartMemberConversationUseCase(
      { find } as unknown as MemberProfileRepository,
      { create, findForMember } as unknown as ConversationRepository,
    );
    await expect(useCase.execute(principal(['members.profile_read', 'conversations.read', 'conversations.reply']), 'member', { channelId: 'channel' }))
      .resolves.toEqual(existing);
    expect(find).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('exige conversations.read para localizar uma conversa pelo membro', async () => {
    const findForMember = vi.fn().mockResolvedValue({ id: 'conversation' });
    const useCase = new GetMemberConversationUseCase({ findForMember } as unknown as ConversationRepository);
    await expect(useCase.execute(principal([]), 'member')).rejects.toThrow(AuthorizationError);
    await expect(useCase.execute(principal(['conversations.read']), 'member')).resolves.toEqual({
      conversation: { id: 'conversation' },
    });
  });
});

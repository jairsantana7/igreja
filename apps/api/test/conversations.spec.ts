import { describe, expect, it, vi } from 'vitest';
import type { ConversationRepository } from '../src/application/ports/conversation.port';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import { ConnectConversationChannelUseCase, CreateConversationChannelUseCase, CreateMemberFromConversationUseCase, DeleteConversationChannelUseCase, GetConversationMediaUseCase, ListConversationsUseCase, ReplyConversationUseCase } from '../src/application/use-cases/conversation.use-cases';
import { AuthorizationError, ConflictError } from '../src/application/use-cases/errors';
import type { MemberOnboardingRepository } from '../src/application/ports/member-onboarding.port';
import type { PasswordHasher } from '../src/application/ports/authentication.port';
import type { MediaStorage } from '../src/application/ports/media-storage.port';

const principal = (permissions: AuthenticatedPrincipal['permissions']): AuthenticatedPrincipal => ({
  userId: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000001',
  name: 'Pastor',
  email: 'pastor@example.test',
  roles: ['pastor'],
  permissions,
});

describe('central de conversas', () => {
  it('exige permissão granular antes de listar conversas', () => {
    const list = vi.fn();
    const useCase = new ListConversationsUseCase({ list } as unknown as ConversationRepository);
    expect(() => useCase.execute(principal([]))).toThrow(AuthorizationError);
    expect(list).not.toHaveBeenCalled();
  });

  it('permite ao pastor configurar apenas o próprio canal', () => {
    const createChannel = vi.fn();
    const useCase = new CreateConversationChannelUseCase({ createChannel } as unknown as ConversationRepository);
    const input = { providerKey: 'whatsapp_cloud', displayName: 'Meu WhatsApp', phoneNumber: '+5511999999999', providerAccountId: '' };
    expect(() => useCase.execute(principal(['channels.manage_own']), { ...input, ownerUserId: '20000000-0000-4000-8000-000000000002' })).toThrow(AuthorizationError);
    expect(createChannel).not.toHaveBeenCalled();
  });

  it('preserva a resposta pendente quando a fila não está disponível', async () => {
    const pendingMessage = { id: '90000000-0000-4000-8000-000000000001', status: 'pending' };
    const conversations = {
      addOutbound: vi.fn().mockResolvedValue(pendingMessage),
      markQueued: vi.fn(),
    };
    const queue = { enqueue: vi.fn().mockRejectedValue(new Error('adapter ausente')) };
    const useCase = new ReplyConversationUseCase(conversations as unknown as ConversationRepository, queue);
    await expect(useCase.execute(principal(['conversations.reply']), 'conversation', 'Lembrete')).rejects.toThrow(ConflictError);
    expect(conversations.addOutbound).toHaveBeenCalledOnce();
    expect(conversations.markQueued).not.toHaveBeenCalled();
  });

  it('enfileira com chave idempotente e marca a mensagem', async () => {
    const message = { id: '90000000-0000-4000-8000-000000000001', status: 'pending' };
    const conversations = {
      addOutbound: vi.fn().mockResolvedValue(message),
      markQueued: vi.fn().mockResolvedValue({ ...message, status: 'queued' }),
    };
    const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: 'job-1' }) };
    const useCase = new ReplyConversationUseCase(conversations as unknown as ConversationRepository, queue);
    await expect(useCase.execute(principal(['conversations.reply']), 'conversation', 'Lembrete')).resolves.toMatchObject({ status: 'queued' });
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ deduplicationKey: message.id }), { attempts: 5 });
    expect(conversations.markQueued).toHaveBeenCalledWith(expect.any(Object), 'conversation', message.id, 'job-1');
  });

  it('só lê mídia depois de validar permissão e acesso à conversa', async () => {
    const resolveAttachment = vi.fn().mockResolvedValue({ storageKey: 'media.ogg', mimeType: 'audio/ogg' });
    const read = vi.fn().mockResolvedValue(Buffer.from('OggS'));
    const useCase = new GetConversationMediaUseCase(
      { resolveAttachment } as unknown as ConversationRepository,
      { read } as unknown as MediaStorage,
    );
    await expect(useCase.execute(principal([]), 'conversation', 'media')).rejects.toThrow(AuthorizationError);
    expect(resolveAttachment).not.toHaveBeenCalled();
    await expect(useCase.execute(principal(['conversations.read']), 'conversation', 'media')).resolves.toMatchObject({ mimeType: 'audio/ogg' });
    expect(resolveAttachment).toHaveBeenCalledWith(expect.any(Object), 'conversation', 'media');
    expect(read).toHaveBeenCalledWith('media.ogg');
  });

  it('valida permissão e adapter antes de enfileirar o pareamento', async () => {
    const conversations = {
      connection: vi.fn().mockResolvedValue({ channelId: 'channel', providerKey: 'whatsapp_web', status: 'configured' }),
      markConnectionRequested: vi.fn(),
    };
    const queue = { enqueue: vi.fn() };
    const disabled = new ConnectConversationChannelUseCase(conversations as unknown as ConversationRepository, queue, { supportsConnection: () => false });
    await expect(disabled.execute(principal(['channels.manage_own']), 'channel')).rejects.toThrow(ConflictError);
    expect(queue.enqueue).not.toHaveBeenCalled();

    const enabled = new ConnectConversationChannelUseCase(conversations as unknown as ConversationRepository, queue, { supportsConnection: () => true });
    queue.enqueue.mockResolvedValue({ jobId: 'connect-1' });
    await enabled.execute(principal(['channels.manage_own']), 'channel');
    expect(conversations.markConnectionRequested).toHaveBeenCalledOnce();
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      name: 'conversations.channel.connect',
      deduplicationKey: 'channel:connect',
    }), { attempts: 3 });
  });

  it('só exclui canal desconectado e sem histórico', async () => {
    const deleteChannel = vi.fn().mockResolvedValue('connected');
    const useCase = new DeleteConversationChannelUseCase({ deleteChannel } as unknown as ConversationRepository);
    await expect(useCase.execute(principal(['channels.manage_own']), 'channel')).rejects.toThrow('Desconecte o canal');
    deleteChannel.mockResolvedValue('has_conversations');
    await expect(useCase.execute(principal(['channels.manage_own']), 'channel')).rejects.toThrow('precisa ser preservado');
    deleteChannel.mockResolvedValue('has_reminders');
    await expect(useCase.execute(principal(['channels.manage_own']), 'channel')).rejects.toThrow('Remova os lembretes');
    deleteChannel.mockResolvedValue('deleted');
    await expect(useCase.execute(principal(['channels.manage_own']), 'channel')).resolves.toBeUndefined();
    expect(deleteChannel).toHaveBeenCalledTimes(4);
  });

  it('exige todas as permissões para transformar um contato em membro', async () => {
    const createFromConversation = vi.fn();
    const hash = vi.fn();
    const useCase = new CreateMemberFromConversationUseCase(
      { createFromConversation } as unknown as MemberOnboardingRepository,
      { hash } as unknown as PasswordHasher,
    );
    await expect(useCase.execute(principal(['conversations.read', 'users.create']), 'conversation', {
      email: 'pessoa@example.test', password: 'uma-senha-segura',
    })).rejects.toThrow(AuthorizationError);
    expect(hash).not.toHaveBeenCalled();
    expect(createFromConversation).not.toHaveBeenCalled();
  });

  it('normaliza a identidade antes do cadastro pela conversa', async () => {
    const createFromConversation = vi.fn().mockResolvedValue({ id: 'member', name: 'Pessoa', email: 'pessoa@example.test' });
    const hash = vi.fn().mockResolvedValue('hashed');
    const useCase = new CreateMemberFromConversationUseCase(
      { createFromConversation } as unknown as MemberOnboardingRepository,
      { hash } as unknown as PasswordHasher,
    );
    await expect(useCase.execute(principal(['conversations.read', 'users.create', 'members.profile_manage']), 'conversation', {
      email: ' PESSOA@EXAMPLE.TEST ', password: 'uma-senha-segura',
    })).resolves.toMatchObject({ id: 'member' });
    expect(hash).toHaveBeenCalledWith('uma-senha-segura');
    expect(createFromConversation).toHaveBeenCalledWith(expect.any(Object), {
      conversationId: 'conversation', email: 'pessoa@example.test', passwordHash: 'hashed',
    });
  });
});

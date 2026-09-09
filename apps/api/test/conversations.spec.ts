import { describe, expect, it, vi } from 'vitest';
import type { ConversationRepository } from '../src/application/ports/conversation.port';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import { ConnectConversationChannelUseCase, CreateConversationChannelUseCase, CreateMemberFromConversationUseCase, DeleteConversationChannelUseCase, GetConversationMediaUseCase, ListConversationsUseCase, ReactConversationMessageUseCase, ReplyConversationUseCase, RequestConversationHistorySyncUseCase, SendConversationMediaUseCase } from '../src/application/use-cases/conversation.use-cases';
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

  it('preserva a referência da mensagem ao responder um trecho específico', async () => {
    const message = { id: '90000000-0000-4000-8000-000000000001', status: 'pending' };
    const conversations = {
      addOutbound: vi.fn().mockResolvedValue(message),
      markQueued: vi.fn().mockResolvedValue({ ...message, status: 'queued' }),
    };
    const useCase = new ReplyConversationUseCase(
      conversations as unknown as ConversationRepository,
      { enqueue: vi.fn().mockResolvedValue({ jobId: 'job-reply' }) },
    );

    await useCase.execute(principal(['conversations.reply']), 'conversation', 'Resposta', 'quoted-message');

    expect(conversations.addOutbound).toHaveBeenCalledWith(
      expect.any(Object),
      'conversation',
      expect.objectContaining({ body: 'Resposta' }),
      'quoted-message',
    );
  });

  it('valida acesso e adapter antes de enfileirar uma reação', async () => {
    const conversations = { messageActionTarget: vi.fn().mockResolvedValue({ providerKey: 'whatsapp_web' }) };
    const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: 'job-reaction' }) };
    const useCase = new ReactConversationMessageUseCase(
      conversations as unknown as ConversationRepository,
      queue,
      { supportsConnection: (providerKey) => providerKey === 'whatsapp_web' },
    );

    await expect(useCase.execute(principal([]), 'conversation', 'message', '👍')).rejects.toThrow(AuthorizationError);
    expect(conversations.messageActionTarget).not.toHaveBeenCalled();
    await expect(useCase.execute(principal(['conversations.reply']), 'conversation', 'message', '❤️')).resolves.toBeUndefined();
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      name: 'conversations.message.react',
      deduplicationKey: 'message:reaction',
      payload: expect.objectContaining({ messageId: 'message', emoji: '❤️' }),
    }), { attempts: 3 });
  });

  it('valida e enfileira uma imagem privada enviada pela Central', async () => {
    const message = { id: '90000000-0000-4000-8000-000000000001', status: 'pending' };
    const conversations = {
      addOutboundMedia: vi.fn().mockResolvedValue(message),
      markQueued: vi.fn().mockResolvedValue({ ...message, status: 'queued' }),
    };
    const storage = {
      save: vi.fn().mockResolvedValue({ storageKey: 'media.jpg', mimeType: 'image/jpeg' }),
      delete: vi.fn(),
    };
    const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: 'job-media' }) };
    const useCase = new SendConversationMediaUseCase(
      conversations as unknown as ConversationRepository,
      storage as unknown as MediaStorage,
      queue,
    );

    await expect(useCase.execute(principal(['conversations.reply']), 'conversation', {
      content: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimeType: 'image/jpeg', caption: '  Foto do encontro  ',
    })).resolves.toMatchObject({ status: 'queued' });
    expect(conversations.addOutboundMedia).toHaveBeenCalledWith(expect.any(Object), 'conversation', expect.objectContaining({
      body: 'Foto do encontro',
      attachment: expect.objectContaining({ mediaKind: 'image', byteSize: 4 }),
    }));
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ deduplicationKey: message.id }), { attempts: 5 });
  });

  it('rejeita conteúdo disfarçado e remove o arquivo se a conversa não estiver acessível', async () => {
    const conversations = { addOutboundMedia: vi.fn().mockResolvedValue(null) };
    const storage = {
      save: vi.fn().mockResolvedValue({ storageKey: 'media.ogg', mimeType: 'audio/ogg' }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new SendConversationMediaUseCase(
      conversations as unknown as ConversationRepository,
      storage as unknown as MediaStorage,
      { enqueue: vi.fn() },
    );

    await expect(useCase.execute(principal(['conversations.reply']), 'conversation', {
      content: Buffer.from('não é áudio'), mimeType: 'audio/ogg',
    })).rejects.toThrow('não corresponde');
    expect(storage.save).not.toHaveBeenCalled();

    await expect(useCase.execute(principal(['conversations.reply']), 'conversation', {
      content: Buffer.from('OggSconteúdo'), mimeType: 'audio/ogg',
    })).rejects.toThrow('Conversa não encontrada');
    expect(storage.delete).toHaveBeenCalledWith('media.ogg');
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

  it('valida acesso e enfileira a sincronização ao abrir uma conversa', async () => {
    const conversations = {
      historySyncTarget: vi.fn().mockResolvedValue({ providerKey: 'whatsapp_web' }),
    };
    const queue = { enqueue: vi.fn().mockResolvedValue({ jobId: 'history-1' }) };
    const useCase = new RequestConversationHistorySyncUseCase(
      conversations as unknown as ConversationRepository,
      queue,
      { supportsConnection: (providerKey) => providerKey === 'whatsapp_web' },
    );

    await expect(useCase.execute(principal([]), 'conversation')).rejects.toThrow(AuthorizationError);
    expect(conversations.historySyncTarget).not.toHaveBeenCalled();
    await expect(useCase.execute(principal(['conversations.read']), 'conversation')).resolves.toEqual({ status: 'queued' });
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      name: 'conversations.history.sync',
      deduplicationKey: 'conversation:history',
      payload: expect.objectContaining({ tenantId: principal([]).tenantId, conversationId: 'conversation' }),
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

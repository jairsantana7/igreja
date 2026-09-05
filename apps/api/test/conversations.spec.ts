import { describe, expect, it, vi } from 'vitest';
import type { ConversationRepository } from '../src/application/ports/conversation.port';
import type { AuthenticatedPrincipal } from '../src/domain/entities/permission';
import { CreateConversationChannelUseCase, ListConversationsUseCase, ReplyConversationUseCase } from '../src/application/use-cases/conversation.use-cases';
import { AuthorizationError, ConflictError } from '../src/application/use-cases/errors';

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
});

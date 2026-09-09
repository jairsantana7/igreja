import { describe, expect, it, vi } from 'vitest';
import { AesGcmStateCipher } from '../src/infrastructure/security/aes-gcm-state.cipher';
import { RoutedJobQueue } from '../src/infrastructure/queue/routed-job.queue';
import { createBaileysAuthState } from '../src/infrastructure/integrations/baileys/baileys-auth-state';
import { BaileysConversationProvider, resolveBaileysContactAddress } from '../src/infrastructure/integrations/baileys/baileys-conversation.provider';
import type { ConversationProviderStateStore, ConversationRuntimeRepository } from '../src/application/ports/conversation.port';
import type { ApplicationLogger } from '../src/application/ports/application-logger.port';
import type { WAMessage } from '@whiskeysockets/baileys';

describe('adapters do conector de conversas', () => {
  it('criptografa estado sensível com nonce e detecta adulteração', () => {
    const cipher = new AesGcmStateCipher(Buffer.alloc(32, 7).toString('base64'));
    const first = cipher.encrypt('credencial');
    const second = cipher.encrypt('credencial');
    expect(first.equals(second)).toBe(false);
    expect(cipher.decrypt(first)).toBe('credencial');
    first[first.length - 1] = first[first.length - 1]! ^ 1;
    expect(() => cipher.decrypt(first)).toThrow();
  });

  it('encaminha somente jobs de conversa para a fila dedicada', async () => {
    const fallback = { enqueue: vi.fn().mockResolvedValue({ jobId: 'default' }) };
    const conversations = { enqueue: vi.fn().mockResolvedValue({ jobId: 'whatsapp' }) };
    const queue = new RoutedJobQueue(fallback, conversations);
    await expect(queue.enqueue({ name: 'conversations.message.dispatch', payload: {} })).resolves.toEqual({ jobId: 'whatsapp' });
    await expect(queue.enqueue({ name: 'events.communication.dispatch', payload: {} })).resolves.toEqual({ jobId: 'default' });
  });

  it('persiste credenciais e chaves Baileys por canal sem usar arquivos locais', async () => {
    const values = new Map<string, string>();
    const store: ConversationProviderStateStore = {
      get: vi.fn(async (_tenant, _channel, _provider, key) => values.get(key) ?? null),
      set: vi.fn(async (input) => { values.set(input.stateKey, input.value); }),
      remove: vi.fn(async (_tenant, _channel, _provider, key) => { values.delete(key); }),
      clear: vi.fn(async () => { values.clear(); }),
    };
    const scope = { tenantId: 'tenant', channelId: 'channel', providerKey: 'whatsapp_web' };
    const auth = await createBaileysAuthState(store, scope);
    await auth.saveCreds();
    await auth.state.keys.set({ 'device-list': { contact: ['device-a'] } });
    expect(values.has('baileys:creds')).toBe(true);
    await expect(auth.state.keys.get('device-list', ['contact'])).resolves.toEqual({ contact: ['device-a'] });
  });

  it('troca o identificador LID pelo telefone legível do contato', async () => {
    const message = {
      key: {
        remoteJid: '247630768697558@lid',
        remoteJidAlt: '5513987654321@s.whatsapp.net',
      },
    } as WAMessage;
    const getPhoneForLid = vi.fn();

    await expect(resolveBaileysContactAddress(message, getPhoneForLid)).resolves.toEqual({
      address: '+5513987654321',
      aliases: [
        '247630768697558@lid',
        '5513987654321@s.whatsapp.net',
        '5513987654321',
        '+5513987654321',
      ],
    });
    expect(getPhoneForLid).not.toHaveBeenCalled();
  });

  it('consulta o mapeamento persistido quando a mensagem não traz o telefone alternativo', async () => {
    const message = { key: { remoteJid: '247630768697558@lid' } } as WAMessage;
    const getPhoneForLid = vi.fn().mockResolvedValue('5513987654321@s.whatsapp.net');

    await expect(resolveBaileysContactAddress(message, getPhoneForLid)).resolves.toMatchObject({
      address: '+5513987654321',
    });
    expect(getPhoneForLid).toHaveBeenCalledWith('247630768697558@lid');
  });

  it('sincroniza como saída a mensagem enviada diretamente pelo celular', async () => {
    const receiveOutboundMirror = vi.fn();
    const provider = new BaileysConversationProvider(
      {} as ConversationProviderStateStore,
      { receiveOutboundMirror } as unknown as ConversationRuntimeRepository,
      {} as ApplicationLogger,
    );
    (provider as any).sessions.set('channel', {
      socket: { signalRepository: { lidMapping: { getPNForLID: vi.fn() } } },
    });
    const message = {
      key: {
        id: 'provider-message',
        fromMe: true,
        remoteJid: '247630768697558@lid',
        remoteJidAlt: '5513987654321@s.whatsapp.net',
      },
      message: { conversation: 'Mensagem pelo celular' },
      messageTimestamp: 1_789_000_000,
    } as WAMessage;

    await (provider as any).receive({ id: 'channel', tenantId: 'tenant' }, message);

    expect(receiveOutboundMirror).toHaveBeenCalledWith(expect.objectContaining({
      contactAddress: '+5513987654321',
      body: 'Mensagem pelo celular',
      providerMessageId: 'provider-message',
    }));
  });
});

import { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  downloadMediaMessage,
  DisconnectReason,
  normalizeMessageContent,
  type Chat,
  type Contact,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import type { ApplicationLogger } from '../../../application/ports/application-logger.port';
import type { MediaStorage } from '../../../application/ports/media-storage.port';
import type {
  ConversationIncomingAttachment,
  ConversationHistorySync,
  ConversationOutboundDelivery,
  ConversationProvider,
  ConversationProviderStateStore,
  ConversationRuntimeChannel,
  ConversationRuntimeRepository,
} from '../../../application/ports/conversation.port';
import {
  canonicalConversationMimeType,
  conversationMediaSizeLimit,
  matchesConversationMediaSignature,
} from '../../../application/services/conversation-media.policy';
import { createBaileysAuthState } from './baileys-auth-state';

const PROVIDER_KEY = 'whatsapp_web';
const QR_TTL_MS = 45_000;
interface ConversationMediaDescriptor {
  mediaKind: 'image' | 'audio';
  mimeType: NonNullable<ReturnType<typeof canonicalConversationMimeType>>;
  maxSize: number;
  declaredSize: number | null;
  durationSeconds: number | null;
}
interface BaileysLogger {
  level: string;
  child: (context: Record<string, unknown>) => BaileysLogger;
  trace: (value: unknown, message?: string) => void;
  debug: (value: unknown, message?: string) => void;
  info: (value: unknown, message?: string) => void;
  warn: (value: unknown, message?: string) => void;
  error: (value: unknown, message?: string) => void;
}

const silentBaileysLogger: BaileysLogger = {
  level: 'silent',
  child: () => silentBaileysLogger,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface ActiveSession {
  socket: WASocket;
  manuallyClosing: boolean;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  inbound: Promise<void>;
  historyChats: Set<string>;
  historyMessages: Map<string, number>;
}

export interface BaileysHistoryOptions {
  chatLimit: number;
  messageLimit: number;
}

function directJid(address: string): string | null {
  const normalized = address.trim();
  if (normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@lid')) return normalized;
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
}

function readablePhoneAddress(jid: string): string {
  const digits = jid.replace(/@.*/, '').replace(/\D/g, '');
  return digits ? `+${digits}` : jid;
}

export async function resolveBaileysContactAddress(
  message: WAMessage,
  getPhoneForLid: (lid: string) => Promise<string | null>,
): Promise<{ address: string; aliases: string[] } | null> {
  const remoteJid = message.key.remoteJid ?? '';
  if (!directJid(remoteJid)) return null;
  const alternateJid = message.key.remoteJidAlt ?? '';
  const phoneJid = remoteJid.endsWith('@s.whatsapp.net')
    ? remoteJid
    : alternateJid.endsWith('@s.whatsapp.net')
      ? alternateJid
      : await getPhoneForLid(remoteJid);
  if (!phoneJid) return { address: remoteJid, aliases: [remoteJid] };
  const address = readablePhoneAddress(phoneJid);
  return {
    address,
    aliases: [...new Set([remoteJid, alternateJid, phoneJid, phoneJid.replace(/@.*/, ''), address].filter(Boolean))],
  };
}

function textBody(message: WAMessage): string | null {
  const content = normalizeMessageContent(message.message);
  const body = content?.conversation
    ?? content?.extendedTextMessage?.text
    ?? content?.imageMessage?.caption
    ?? content?.videoMessage?.caption
    ?? content?.documentMessage?.caption;
  const normalized = body?.trim();
  return normalized ? normalized.slice(0, 4_000) : null;
}

function numericValue(value: number | { toString(): string } | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(typeof value === 'number' ? value : value.toString());
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function mediaDescriptor(message: WAMessage): ConversationMediaDescriptor | null {
  const content = normalizeMessageContent(message.message);
  const image = content?.imageMessage;
  const audio = content?.audioMessage;
  const source = image ?? audio;
  if (!source) return null;
  const mimeType = canonicalConversationMimeType(source.mimetype);
  if (!mimeType) return null;
  const mediaKind = image ? 'image' : 'audio';
  const duration = audio ? numericValue(audio.seconds) : null;
  return {
    mediaKind,
    mimeType,
    maxSize: conversationMediaSizeLimit(mediaKind),
    declaredSize: numericValue(source.fileLength),
    durationSeconds: duration !== null && duration <= 86_400 ? duration : null,
  };
}

function mediaFallbackBody(message: WAMessage): string | null {
  const content = normalizeMessageContent(message.message);
  if (content?.imageMessage) return 'Imagem';
  if (content?.audioMessage) return 'Áudio';
  return null;
}

function receivedAt(message: WAMessage): Date {
  const timestamp = message.messageTimestamp;
  const seconds = typeof timestamp === 'number'
    ? timestamp
    : Number(timestamp?.toString() ?? 0);
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function historyActivityAt(chat: Chat): Date {
  const value = chat.lastMsgTimestamp ?? chat.conversationTimestamp;
  const seconds = numericValue(value);
  if (seconds === null) return new Date();
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export class BaileysConversationProvider implements ConversationProvider {
  readonly providerKey = PROVIDER_KEY;
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly states: ConversationProviderStateStore,
    private readonly conversations: ConversationRuntimeRepository,
    private readonly storage: MediaStorage,
    private readonly logger: ApplicationLogger,
    private readonly history: BaileysHistoryOptions = { chatLimit: 50, messageLimit: 50 },
  ) {}

  async connect(channel: ConversationRuntimeChannel): Promise<void> {
    if (this.sessions.has(channel.id)) return;
    const auth = await createBaileysAuthState(this.states, {
      tenantId: channel.tenantId,
      channelId: channel.id,
      providerKey: this.providerKey,
    });
    let resolveReady: () => void = () => undefined;
    let rejectReady: (error: Error) => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    void ready.catch(() => undefined);
    const socket = makeWASocket({
      auth: auth.state,
      logger: silentBaileysLogger,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
      shouldIgnoreJid: (jid) => !directJid(jid),
      generateHighQualityLinkPreview: false,
    });
    const session: ActiveSession = {
      socket,
      manuallyClosing: false,
      ready,
      resolveReady,
      rejectReady,
      inbound: Promise.resolve(),
      historyChats: new Set(),
      historyMessages: new Map(),
    };
    this.sessions.set(channel.id, session);
    await this.conversations.updateConnection(channel.tenantId, channel.id, { status: 'connecting' });

    socket.ev.on('creds.update', () => auth.saveCreds().catch((error) => {
      this.logger.captureException(error, { event: 'whatsapp_credentials_save_failed', channelId: channel.id });
    }));
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) session.inbound = session.inbound.then(() => this.receive(channel, message));
    });
    socket.ev.on('messaging-history.set', (history) => {
      session.inbound = session.inbound.then(() => this.receiveHistory(channel, session, history));
    });
    socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(channel, session, auth.clear, update.connection, update.qr, update.lastDisconnect?.error);
    });
  }

  async disconnect(channel: ConversationRuntimeChannel): Promise<void> {
    const session = this.sessions.get(channel.id);
    if (session) {
      session.manuallyClosing = true;
      await session.socket.logout().catch(() => session.socket.end(new Error('Desconexão solicitada.')));
      this.sessions.delete(channel.id);
    }
    await this.states.clear(channel.tenantId, channel.id, this.providerKey);
    await this.conversations.updateConnection(channel.tenantId, channel.id, { status: 'disconnected' });
    this.logger.info('whatsapp_channel_disconnected', { channelId: channel.id, tenantId: channel.tenantId });
  }

  async send(input: ConversationOutboundDelivery & { idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    await this.connect(input.channel);
    const session = this.sessions.get(input.channel.id);
    if (!session) throw new Error('A sessão do canal não pôde ser inicializada.');
    await Promise.race([
      session.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('O canal ainda não está conectado.')), 30_000)),
    ]);
    const jid = directJid(input.recipient);
    if (!jid) throw new Error('O destinatário não possui um endereço individual válido.');
    let result;
    if (input.attachment) {
      const content = await this.storage.read(input.attachment.storageKey);
      result = input.attachment.mediaKind === 'image'
        ? await session.socket.sendMessage(jid, {
            image: content,
            mimetype: input.attachment.mimeType,
            caption: input.body === 'Imagem' ? undefined : input.body,
          })
        : await session.socket.sendMessage(jid, {
            audio: content,
            mimetype: input.attachment.mimeType,
            ptt: input.attachment.mimeType === 'audio/ogg',
          });
    } else {
      result = await session.socket.sendMessage(jid, { text: input.body });
    }
    const providerMessageId = result?.key.id;
    if (!providerMessageId) throw new Error('O WhatsApp não retornou o identificador da mensagem.');
    return { providerMessageId };
  }

  async syncHistory(input: ConversationHistorySync): Promise<void> {
    await this.connect(input.channel);
    const session = this.sessions.get(input.channel.id);
    if (!session) throw new Error('A sessão do canal não pôde ser inicializada.');
    await this.waitUntilReady(session);
    const jid = directJid(input.recipient);
    if (!jid) throw new Error('A conversa não possui um endereço individual válido.');
    await session.socket.fetchMessageHistory(
      this.history.messageLimit,
      {
        remoteJid: jid,
        id: input.oldestMessage.providerMessageId,
        fromMe: input.oldestMessage.direction === 'outbound',
      },
      input.oldestMessage.createdAt.getTime(),
    );
  }

  async shutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.manuallyClosing = true;
      session.socket.end(new Error('Worker encerrado.'));
    }
    this.sessions.clear();
  }

  private async receive(channel: ConversationRuntimeChannel, message: WAMessage, preferredContactName?: string): Promise<void> {
    try {
      const remoteJid = message.key.remoteJid ?? '';
      if (!message.key.id || !directJid(remoteJid)) return;
      const body = textBody(message) ?? mediaFallbackBody(message);
      if (!body) return;
      const session = this.sessions.get(channel.id);
      if (!session) return;
      const contact = await resolveBaileysContactAddress(
        message,
        (lid) => session.socket.signalRepository.lidMapping.getPNForLID(lid),
      );
      if (!contact) return;
      let attachment: ConversationIncomingAttachment | undefined;
      try {
        attachment = await this.downloadAttachment(message, session.socket);
      } catch (error) {
        this.logger.warn('whatsapp_media_download_failed', {
          channelId: channel.id,
          tenantId: channel.tenantId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      }
      try {
        const stored = message.key.fromMe
          ? await this.conversations.receiveOutboundMirror({
              tenantId: channel.tenantId,
              channelId: channel.id,
              providerMessageId: message.key.id,
              contactName: preferredContactName ?? `Contato ${contact.address.replace(/\D/g, '').slice(-4)}`,
              contactAddress: contact.address,
              contactAddressAliases: contact.aliases,
              body,
              attachment,
              sentAt: receivedAt(message),
            })
          : await this.conversations.receiveInbound({
              tenantId: channel.tenantId,
              channelId: channel.id,
              providerMessageId: message.key.id,
              contactName: preferredContactName ?? this.contactName(message, remoteJid),
              contactAddress: contact.address,
              contactAddressAliases: contact.aliases,
              body,
              attachment,
              receivedAt: receivedAt(message),
            });
        if (attachment && !stored) await this.storage.delete(attachment.storageKey);
      } catch (error) {
        if (attachment) await this.storage.delete(attachment.storageKey).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      this.logger.captureException(error, { event: 'whatsapp_inbound_processing_failed', channelId: channel.id });
    }
  }

  private async receiveHistory(
    channel: ConversationRuntimeChannel,
    session: ActiveSession,
    history: { chats: Chat[]; contacts: Contact[]; messages: WAMessage[]; peerDataRequestSessionId?: string | null },
  ): Promise<void> {
    const onDemand = Boolean(history.peerDataRequestSessionId);
    const names = this.historyContactNames(history.contacts);
    let importedChats = 0;
    let importedMessages = 0;

    for (const chat of history.chats) {
      const remoteJid = chat.id ?? '';
      if (!directJid(remoteJid)) continue;
      const contact = await resolveBaileysContactAddress(
        { key: { remoteJid, remoteJidAlt: chat.pnJid ?? undefined } } as WAMessage,
        (lid) => session.socket.signalRepository.lidMapping.getPNForLID(lid),
      );
      if (!contact) continue;
      if (!onDemand && !session.historyChats.has(contact.address) && session.historyChats.size >= this.history.chatLimit) continue;
      session.historyChats.add(contact.address);
      await this.conversations.ensureConversation({
        tenantId: channel.tenantId,
        channelId: channel.id,
        contactName: this.historyContactName(names, contact.aliases, chat.name ?? chat.displayName, contact.address),
        contactAddress: contact.address,
        contactAddressAliases: contact.aliases,
        lastActivityAt: historyActivityAt(chat),
      });
      importedChats += 1;
    }

    const demandCounts = new Map<string, number>();
    for (const message of [...history.messages].reverse()) {
      const remoteJid = message.key.remoteJid ?? '';
      if (!message.key.id || !directJid(remoteJid)) continue;
      const contact = await resolveBaileysContactAddress(
        message,
        (lid) => session.socket.signalRepository.lidMapping.getPNForLID(lid),
      );
      if (!contact) continue;
      const counts = onDemand ? demandCounts : session.historyMessages;
      const count = counts.get(contact.address) ?? 0;
      if (count >= this.history.messageLimit) continue;
      if (!onDemand && !session.historyChats.has(contact.address)) {
        if (session.historyChats.size >= this.history.chatLimit) continue;
        session.historyChats.add(contact.address);
      }
      counts.set(contact.address, count + 1);
      const preferredName = this.historyContactName(names, contact.aliases, undefined, contact.address);
      await this.receive(channel, message, preferredName);
      importedMessages += 1;
    }

    this.logger.info('whatsapp_history_chunk_processed', {
      tenantId: channel.tenantId,
      channelId: channel.id,
      onDemand,
      chats: importedChats,
      messages: importedMessages,
    });
  }

  private historyContactNames(contacts: Contact[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const contact of contacts) {
      const name = [contact.name, contact.notify, contact.verifiedName]
        .find((candidate) => candidate?.trim().length && candidate.trim().length >= 2)
        ?.trim().slice(0, 120);
      if (!name) continue;
      for (const address of [contact.id, contact.lid, contact.phoneNumber].filter(Boolean) as string[]) result.set(address, name);
    }
    return result;
  }

  private historyContactName(names: Map<string, string>, aliases: string[], chatName: string | null | undefined, address: string): string {
    const saved = aliases.map((alias) => names.get(alias)).find(Boolean);
    const name = saved ?? chatName?.trim().slice(0, 120);
    return name && name.length >= 2 ? name : `Contato ${address.replace(/\D/g, '').slice(-4)}`;
  }

  private async waitUntilReady(session: ActiveSession): Promise<void> {
    await Promise.race([
      session.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('O canal ainda não está conectado.')), 30_000)),
    ]);
  }

  private contactName(message: WAMessage, remoteJid: string): string {
    const pushName = message.pushName?.trim().slice(0, 120);
    return pushName && pushName.length >= 2 ? pushName : `Contato ${remoteJid.replace(/@.*/, '').slice(-4)}`;
  }

  private async downloadAttachment(message: WAMessage, socket: WASocket): Promise<ConversationIncomingAttachment | undefined> {
    const descriptor = mediaDescriptor(message);
    if (!descriptor) return undefined;
    if (descriptor.declaredSize !== null && descriptor.declaredSize > descriptor.maxSize) {
      throw new Error('MediaSizeLimitExceeded');
    }
    const stream = await downloadMediaMessage(message, 'stream', {}, {
      logger: silentBaileysLogger,
      reuploadRequest: (mediaMessage) => socket.updateMediaMessage(mediaMessage),
    });
    const chunks: Buffer[] = [];
    let byteSize = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteSize += buffer.length;
      if (byteSize > descriptor.maxSize) {
        stream.destroy();
        throw new Error('MediaSizeLimitExceeded');
      }
      chunks.push(buffer);
    }
    if (byteSize === 0) throw new Error('EmptyMedia');
    const content = Buffer.concat(chunks, byteSize);
    if (!matchesConversationMediaSignature(content, descriptor.mimeType)) throw new Error('InvalidMediaSignature');
    const stored = await this.storage.save({ content, mimeType: descriptor.mimeType });
    return {
      ...stored,
      mediaKind: descriptor.mediaKind,
      byteSize,
      durationSeconds: descriptor.durationSeconds ?? undefined,
    };
  }

  private async handleConnectionUpdate(
    channel: ConversationRuntimeChannel,
    session: ActiveSession,
    clearAuth: () => Promise<void>,
    connection?: 'open' | 'connecting' | 'close',
    qr?: string,
    disconnectError?: unknown,
  ): Promise<void> {
    try {
      if (session.manuallyClosing) return;
      if (qr) {
        const expiresAt = new Date(Date.now() + QR_TTL_MS);
        await this.states.set({
          tenantId: channel.tenantId,
          channelId: channel.id,
          providerKey: this.providerKey,
          stateKey: 'pairing_qr',
          value: qr,
          expiresAt,
        });
        await this.conversations.updateConnection(channel.tenantId, channel.id, { status: 'awaiting_qr', qrExpiresAt: expiresAt });
        this.logger.info('whatsapp_pairing_qr_ready', { channelId: channel.id, tenantId: channel.tenantId });
      }
      if (connection === 'open') {
        await this.states.remove(channel.tenantId, channel.id, this.providerKey, 'pairing_qr');
        await this.conversations.updateConnection(channel.tenantId, channel.id, { status: 'connected' });
        session.resolveReady();
        await this.resolveExistingLidContacts(channel, session.socket);
        this.logger.info('whatsapp_channel_connected', { channelId: channel.id, tenantId: channel.tenantId });
      }
      if (connection !== 'close') return;
      this.sessions.delete(channel.id);
      if (session.manuallyClosing) return;
      const statusCode = disconnectError instanceof Boom ? disconnectError.output.statusCode : undefined;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      if (loggedOut) await clearAuth();
      const failureCode = loggedOut ? 'logged_out' : 'connection_closed';
      await this.conversations.updateConnection(channel.tenantId, channel.id, { status: loggedOut ? 'disconnected' : 'failed', failureCode });
      session.rejectReady(new Error(failureCode));
      this.logger.warn('whatsapp_channel_connection_closed', { channelId: channel.id, tenantId: channel.tenantId, failureCode });
      if (!loggedOut) setTimeout(() => void this.connect(channel).catch((error) => {
        this.logger.captureException(error, { event: 'whatsapp_reconnect_failed', channelId: channel.id });
      }), 5_000);
    } catch (error) {
      this.logger.captureException(error, { event: 'whatsapp_connection_update_failed', channelId: channel.id });
    }
  }

  private async resolveExistingLidContacts(channel: ConversationRuntimeChannel, socket: WASocket): Promise<void> {
    const unresolved = await this.conversations.listUnresolvedContacts(channel.tenantId, channel.id);
    for (const contact of unresolved) {
      const phoneJid = await socket.signalRepository.lidMapping.getPNForLID(contact.contactAddress);
      if (!phoneJid) continue;
      await this.conversations.resolveContactAddress(
        channel.tenantId,
        channel.id,
        contact.conversationId,
        readablePhoneAddress(phoneJid),
      );
    }
  }
}

import { Boom } from '@hapi/boom';
import makeWASocket, {
  downloadMediaMessage,
  DisconnectReason,
  normalizeMessageContent,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import type { ApplicationLogger } from '../../../application/ports/application-logger.port';
import type { MediaStorage, StoredMedia } from '../../../application/ports/media-storage.port';
import type {
  ConversationIncomingAttachment,
  ConversationOutboundDelivery,
  ConversationProvider,
  ConversationProviderStateStore,
  ConversationRuntimeChannel,
  ConversationRuntimeRepository,
} from '../../../application/ports/conversation.port';
import { createBaileysAuthState } from './baileys-auth-state';

const PROVIDER_KEY = 'whatsapp_web';
const QR_TTL_MS = 45_000;
export const MAX_CONVERSATION_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_CONVERSATION_AUDIO_SIZE = 20 * 1024 * 1024;
type SupportedConversationMime = StoredMedia['mimeType'];
interface ConversationMediaDescriptor {
  mediaKind: 'image' | 'audio';
  mimeType: SupportedConversationMime;
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

function canonicalMimeType(value: string | null | undefined): SupportedConversationMime | null {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase();
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return ['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac'].includes(mimeType ?? '')
    ? mimeType as SupportedConversationMime
    : null;
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
  const mimeType = canonicalMimeType(source.mimetype);
  if (!mimeType) return null;
  const mediaKind = image ? 'image' : 'audio';
  const duration = audio ? numericValue(audio.seconds) : null;
  return {
    mediaKind,
    mimeType,
    maxSize: mediaKind === 'image' ? MAX_CONVERSATION_IMAGE_SIZE : MAX_CONVERSATION_AUDIO_SIZE,
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

export function matchesConversationMediaSignature(content: Buffer, mimeType: SupportedConversationMime): boolean {
  if (mimeType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mimeType === 'image/png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'audio/ogg') return content.length >= 4 && content.subarray(0, 4).toString('ascii') === 'OggS';
  if (mimeType === 'audio/mp4') return content.length >= 12 && content.subarray(4, 8).toString('ascii') === 'ftyp';
  if (mimeType === 'audio/aac') return content.length >= 2 && content[0] === 0xff && (content[1]! & 0xf6) === 0xf0;
  return content.length >= 3 && (content.subarray(0, 3).toString('ascii') === 'ID3' || (content[0] === 0xff && (content[1]! & 0xe0) === 0xe0));
}

function receivedAt(message: WAMessage): Date {
  const timestamp = message.messageTimestamp;
  const seconds = typeof timestamp === 'number'
    ? timestamp
    : Number(timestamp?.toString() ?? 0);
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
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    const session: ActiveSession = { socket, manuallyClosing: false, ready, resolveReady, rejectReady, inbound: Promise.resolve() };
    this.sessions.set(channel.id, session);
    await this.conversations.updateConnection(channel.tenantId, channel.id, { status: 'connecting' });

    socket.ev.on('creds.update', () => auth.saveCreds().catch((error) => {
      this.logger.captureException(error, { event: 'whatsapp_credentials_save_failed', channelId: channel.id });
    }));
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) session.inbound = session.inbound.then(() => this.receive(channel, message));
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
    const result = await session.socket.sendMessage(jid, { text: input.body });
    const providerMessageId = result?.key.id;
    if (!providerMessageId) throw new Error('O WhatsApp não retornou o identificador da mensagem.');
    return { providerMessageId };
  }

  async shutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.manuallyClosing = true;
      session.socket.end(new Error('Worker encerrado.'));
    }
    this.sessions.clear();
  }

  private async receive(channel: ConversationRuntimeChannel, message: WAMessage): Promise<void> {
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
              contactName: `Contato ${contact.address.replace(/\D/g, '').slice(-4)}`,
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
              contactName: this.contactName(message, remoteJid),
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

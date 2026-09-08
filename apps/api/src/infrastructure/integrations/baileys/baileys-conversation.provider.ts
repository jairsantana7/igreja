import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  normalizeMessageContent,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import type { ApplicationLogger } from '../../../application/ports/application-logger.port';
import type {
  ConversationOutboundDelivery,
  ConversationProvider,
  ConversationProviderStateStore,
  ConversationRuntimeChannel,
  ConversationRuntimeRepository,
} from '../../../application/ports/conversation.port';
import { createBaileysAuthState } from './baileys-auth-state';

const PROVIDER_KEY = 'whatsapp_web';
const QR_TTL_MS = 45_000;
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
      if (message.key.fromMe || !message.key.id || !directJid(remoteJid)) return;
      const body = textBody(message);
      if (!body) return;
      const pushName = message.pushName?.trim().slice(0, 120);
      const contactName = pushName && pushName.length >= 2 ? pushName : `Contato ${remoteJid.replace(/@.*/, '').slice(-4)}`;
      await this.conversations.receiveInbound({
        tenantId: channel.tenantId,
        channelId: channel.id,
        providerMessageId: message.key.id,
        contactName,
        contactAddress: remoteJid,
        body,
        receivedAt: receivedAt(message),
      });
    } catch (error) {
      this.logger.captureException(error, { event: 'whatsapp_inbound_processing_failed', channelId: channel.id });
    }
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
}

<script setup lang="ts">
import QRCode from 'qrcode';

type ConversationStatus = 'open' | 'waiting' | 'resolved';
type ChannelConnectionStatus = 'configured' | 'connecting' | 'awaiting_qr' | 'connected' | 'disconnecting' | 'disconnected' | 'failed';
interface Channel {
  id: string; owner: { id: string; name: string }; providerKey: string; displayName: string;
  phoneNumber: string; providerAccountId: string; secretReference: string | null;
  status: ChannelConnectionStatus;
}
interface ChannelConnection {
  channelId: string; providerKey: string; status: ChannelConnectionStatus; qrCode: string | null;
  qrExpiresAt: string | null; failureCode: string | null; connectedAt: string | null; lastSeenAt: string | null;
}
interface Conversation {
  id: string; channel: { id: string; displayName: string; phoneNumber: string };
  assignedTo: { id: string; name: string }; event: { id: string; title: string } | null;
  member: { id: string; name: string } | null;
  contact: { name: string; address: string }; status: ConversationStatus;
  lastMessage: string | null; lastMessageAt: string;
}
interface Message {
  id: string; direction: 'inbound' | 'outbound'; body: string;
  status: 'received' | 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  sentBy: string | null; createdAt: string; attachments: MessageAttachment[];
  quotedMessage: { id: string; direction: 'inbound' | 'outbound'; body: string } | null;
  reactions: Array<{ actor: 'channel' | 'contact'; emoji: string }>;
}
interface MessageAttachment { id: string; kind: 'image' | 'audio'; mimeType: string; byteSize: number; durationSeconds: number | null }
interface EventOption { id: string; title: string; owner: { id: string; name: string } }
useHead({ title: 'Conversas' });
const api = useApi();
const auth = useAuth();
const config = useRuntimeConfig();
const route = useRoute();
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canManageChannel = computed(() => permissions.value.includes('channels.manage_own') || permissions.value.includes('channels.manage_all'));
const canReply = computed(() => permissions.value.includes('conversations.reply'));
const canAssign = computed(() => permissions.value.includes('conversations.assign'));
const canReadTemplates = computed(() => permissions.value.includes('communications.templates_read'));
const canManageFollowups = computed(() => permissions.value.includes('followups.manage'));
const canCreateMember = computed(() => permissions.value.includes('conversations.read') && permissions.value.includes('users.create') && permissions.value.includes('members.profile_manage'));
const { data: conversations, pending, error, refresh } = await useAsyncData('conversations', () => api<Conversation[]>('/conversations'), { server: false });
const { data: channels, refresh: refreshChannels } = await useAsyncData(
  'conversation-channels',
  () => api<Channel[]>('/conversation-channels'),
  { server: false },
);
const { data: events } = await useAsyncData('conversation-event-options', () => api<EventOption[]>('/events'), { server: false });
const selectedId = ref<string | null>(typeof route.query.selected === 'string' ? route.query.selected : null);
const selected = computed(() => (conversations.value ?? []).find((item) => item.id === selectedId.value) ?? null);
const { data: messages, pending: messagesPending, refresh: refreshMessages } = await useAsyncData(
  'conversation-messages',
  () => selectedId.value ? api<Message[]>(`/conversations/${selectedId.value}/messages`) : Promise.resolve([]),
  { server: false, immediate: false },
);
const historySyncingId = ref<string | null>(null);
let historySyncFeedback: ReturnType<typeof setTimeout> | undefined;
const filter = ref<'active' | ConversationStatus>('active');
const query = ref('');
const showChannelForm = ref(false);
const showConversationForm = ref(false);
const showMemberForm = ref(false);
const busy = ref(false);
const busyChannelId = ref<string | null>(null);
const feedback = ref('');
const replyBody = ref('');
const replyingTo = ref<Message | null>(null);
const reactionBusyId = ref<string | null>(null);
const openReactionId = ref<string | null>(null);
const selectedMedia = ref<File | null>(null);
const mediaInput = ref<HTMLInputElement | null>(null);
const channelForm = reactive({ providerKey: 'whatsapp_web', displayName: '', phoneNumber: '', providerAccountId: '', secretReference: '' });
const channelConnections = reactive<Record<string, ChannelConnection>>({});
const channelQrImages = reactive<Record<string, string>>({});
const channelToDelete = ref<Channel | null>(null);
const channelDeleteError = ref('');
const conversationForm = reactive({ channelId: '', contactName: '', contactAddress: '', eventId: '' });
const memberForm = reactive({ email: '' });
const mediaUrls = reactive<Record<string, string>>({});
const mediaErrors = reactive<Record<string, boolean>>({});
const mediaLoading = reactive<Record<string, boolean>>({});
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const statusLabels: Record<ConversationStatus, string> = { open: 'Aberta', waiting: 'Aguardando', resolved: 'Resolvida' };
const messageStatusLabels: Record<Message['status'], string> = {
  received: 'Recebida', pending: 'Pendente', queued: 'Na fila', sent: 'Enviada',
  delivered: 'Entregue', read: 'Lida', failed: 'Falhou',
};
const channelStatusLabels: Record<ChannelConnectionStatus, string> = {
  configured: 'Pronto para conectar', connecting: 'Conectando', awaiting_qr: 'Aguardando leitura do QR',
  connected: 'Conectado', disconnecting: 'Desconectando', disconnected: 'Desconectado', failed: 'Falha na conexão',
};
const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const filtered = computed(() => (conversations.value ?? []).filter((item) => {
  const term = query.value.trim().toLocaleLowerCase('pt-BR');
  const matchesFilter = filter.value === 'active' ? item.status !== 'resolved' : item.status === filter.value;
  return matchesFilter && (!term || item.contact.name.toLocaleLowerCase('pt-BR').includes(term) || item.contact.address.toLocaleLowerCase('pt-BR').includes(term));
}));

watch(conversations, (items) => {
  if (!selectedId.value && items?.length) selectedId.value = items[0]!.id;
}, { immediate: true });
watch(() => route.query.selected, (id) => {
  if (typeof id === 'string') selectedId.value = id;
});
watch(selectedId, async (id) => {
  clearMediaUrls();
  clearSelectedMedia();
  replyingTo.value = null;
  openReactionId.value = null;
  showMemberForm.value = false;
  Object.assign(memberForm, { email: '' });
  if (id) {
    await refreshMessages();
    void requestHistorySync(id);
  }
});
watch(messages, (items) => {
  if (!import.meta.client || !selectedId.value) return;
  for (const message of items ?? []) {
    for (const attachment of message.attachments ?? []) {
      if (!mediaUrls[attachment.id] && !mediaErrors[attachment.id] && !mediaLoading[attachment.id]) void loadMedia(selectedId.value, attachment.id);
    }
  }
});

async function createChannel() {
  busy.value = true; feedback.value = '';
  try {
    await api('/conversation-channels', { method: 'POST', body: {
      ...channelForm,
      secretReference: channelForm.secretReference || undefined,
    } });
    Object.assign(channelForm, { providerKey: 'whatsapp_web', displayName: '', phoneNumber: '', providerAccountId: '', secretReference: '' });
    feedback.value = 'Canal salvo. Use “Conectar” e leia o QR no WhatsApp do celular.';
    await refreshChannels();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível configurar o canal.';
  } finally { busy.value = false; }
}

async function loadConnection(channel: Channel) {
  if (channel.providerKey !== 'whatsapp_web' || !canManageChannel.value) return;
  try {
    const connection = await api<ChannelConnection>(`/conversation-channels/${channel.id}/connection`);
    channelConnections[channel.id] = connection;
    if (connection.qrCode) channelQrImages[channel.id] = await QRCode.toDataURL(connection.qrCode, { margin: 1, width: 256 });
    else delete channelQrImages[channel.id];
  } catch { /* o feedback de ações explícitas é tratado separadamente */ }
}

async function refreshConnections(force = false) {
  connectionPollingTick += 1;
  const refreshAll = force || connectionPollingTick === 1 || connectionPollingTick % 10 === 0;
  const candidates = (channels.value ?? []).filter((channel) => {
    const status = channelConnections[channel.id]?.status ?? channel.status;
    return refreshAll || status === 'connecting' || status === 'awaiting_qr' || status === 'disconnecting';
  });
  await Promise.all(candidates.map(loadConnection));
}

async function connectChannel(channel: Channel) {
  busyChannelId.value = channel.id; feedback.value = '';
  try {
    channelConnections[channel.id] = await api<ChannelConnection>(`/conversation-channels/${channel.id}/connection`, { method: 'POST' });
    feedback.value = 'Conexão iniciada. O QR aparecerá abaixo em alguns segundos.';
    await refreshChannels();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível iniciar a conexão. Verifique se o worker está ativo.';
  } finally { busyChannelId.value = null; }
}

async function disconnectChannel(channel: Channel) {
  busyChannelId.value = channel.id; feedback.value = '';
  try {
    channelConnections[channel.id] = await api<ChannelConnection>(`/conversation-channels/${channel.id}/connection`, { method: 'DELETE' });
    delete channelQrImages[channel.id];
    feedback.value = 'Desconexão solicitada. As credenciais locais serão removidas pelo worker.';
    await refreshChannels();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível desconectar o canal.';
  } finally { busyChannelId.value = null; }
}

async function deleteChannel() {
  const channel = channelToDelete.value;
  if (!channel) return;
  busyChannelId.value = channel.id; feedback.value = '';
  try {
    await api(`/conversation-channels/${channel.id}`, { method: 'DELETE' });
    delete channelConnections[channel.id];
    delete channelQrImages[channel.id];
    channelToDelete.value = null;
    channelDeleteError.value = '';
    feedback.value = 'Canal excluído.';
    await refreshChannels();
  } catch (requestError: any) {
    channelDeleteError.value = requestError?.data?.message ?? 'Não foi possível excluir o canal.';
    feedback.value = channelDeleteError.value;
  } finally { busyChannelId.value = null; }
}

function requestChannelDeletion(channel: Channel) {
  channelDeleteError.value = '';
  channelToDelete.value = channel;
}

function cancelChannelDeletion() {
  channelDeleteError.value = '';
  channelToDelete.value = null;
}

let recoveryPolling: ReturnType<typeof setInterval> | undefined;
let realtimeReconnect: ReturnType<typeof setTimeout> | undefined;
let realtimeRefresh: ReturnType<typeof setTimeout> | undefined;
let realtimeAbort: AbortController | undefined;
const pendingRealtimeResources = new Set<'conversations' | 'channels'>();
let connectionPollingTick = 0;
onMounted(() => {
  void refreshConnections(true);
  void connectRealtime();
  recoveryPolling = setInterval(() => void recoverConversationState(), 60_000);
});
onBeforeUnmount(() => {
  realtimeAbort?.abort();
  if (recoveryPolling) clearInterval(recoveryPolling);
  if (realtimeReconnect) clearTimeout(realtimeReconnect);
  if (realtimeRefresh) clearTimeout(realtimeRefresh);
  if (historySyncFeedback) clearTimeout(historySyncFeedback);
  clearMediaUrls();
});
watch(channels, () => void refreshConnections());

async function recoverConversationState() {
  await refresh();
  if (selectedId.value) await refreshMessages();
  await refreshChannels();
  await refreshConnections(true);
}

async function requestHistorySync(conversationId: string) {
  historySyncingId.value = conversationId;
  if (historySyncFeedback) clearTimeout(historySyncFeedback);
  try {
    await api(`/conversations/${conversationId}/history-sync`, { method: 'POST' });
  } catch {
    // A leitura local continua disponível quando o provider não oferece histórico.
  } finally {
    historySyncFeedback = setTimeout(() => {
      if (historySyncingId.value === conversationId) historySyncingId.value = null;
    }, 4_000);
  }
}

function scheduleRealtimeRefresh(resource: 'conversations' | 'channels') {
  pendingRealtimeResources.add(resource);
  if (realtimeRefresh) clearTimeout(realtimeRefresh);
  realtimeRefresh = setTimeout(() => {
    void (async () => {
      const resources = new Set(pendingRealtimeResources);
      pendingRealtimeResources.clear();
      realtimeRefresh = undefined;
      if (resources.has('channels')) {
        await refreshChannels();
        await refreshConnections(true);
      }
      if (resources.has('conversations')) {
        await refresh();
        if (selectedId.value) await refreshMessages();
      }
    })();
  }, 80);
}

async function connectRealtime() {
  const controller = new AbortController();
  realtimeAbort = controller;
  try {
    const headers = new Headers({ Accept: 'text/event-stream' });
    if (auth.session.value?.sessionProof) headers.set('X-Session-Proof', auth.session.value.sessionProof);
    const baseUrl = String(config.public.apiBaseUrl).replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/conversations/events`, {
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    if (response.status === 401) {
      auth.logout();
      await navigateTo('/login');
      return;
    }
    if (!response.ok || !response.body) throw new Error('RealtimeUnavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!controller.signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const eventType = block.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
        if (eventType === 'conversations.changed') scheduleRealtimeRefresh('conversations');
        if (eventType === 'channels.changed') scheduleRealtimeRefresh('channels');
        boundary = buffer.indexOf('\n\n');
      }
    }
  } catch {
    // O sincronismo de recuperação mantém a tela funcional enquanto o stream volta.
  } finally {
    if (!controller.signal.aborted && realtimeAbort === controller) {
      realtimeReconnect = setTimeout(() => void connectRealtime(), 1_500);
    }
  }
}

async function startConversation() {
  busy.value = true; feedback.value = '';
  try {
    const created = await api<Conversation>('/conversations', { method: 'POST', body: {
      channelId: conversationForm.channelId,
      contactName: conversationForm.contactName,
      contactAddress: conversationForm.contactAddress,
      eventId: conversationForm.eventId || undefined,
    } });
    Object.assign(conversationForm, { channelId: '', contactName: '', contactAddress: '', eventId: '' });
    showConversationForm.value = false;
    await refresh();
    selectedId.value = created.id;
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível iniciar a conversa.';
  } finally { busy.value = false; }
}

async function reply() {
  if (!selected.value || (!selectedMedia.value && !replyBody.value.trim())) return;
  busy.value = true; feedback.value = '';
  try {
    if (selectedMedia.value) {
      const form = new FormData();
      form.append('media', selectedMedia.value);
      if (selectedMedia.value.type.startsWith('image/') && replyBody.value.trim()) form.append('caption', replyBody.value.trim());
      if (replyingTo.value) form.append('replyToMessageId', replyingTo.value.id);
      await api(`/conversations/${selected.value.id}/media`, { method: 'POST', body: form });
    } else {
      await api(`/conversations/${selected.value.id}/messages`, {
        method: 'POST',
        body: { body: replyBody.value, replyToMessageId: replyingTo.value?.id },
      });
    }
    replyBody.value = '';
    replyingTo.value = null;
    clearSelectedMedia();
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    feedback.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível enfileirar a mensagem.';
  } finally {
    await Promise.all([refreshMessages(), refresh()]);
    busy.value = false;
  }
}

function quoteMessage(message: Message) {
  replyingTo.value = message;
  openReactionId.value = null;
  nextTick(() => document.querySelector<HTMLTextAreaElement>('.conversation-composer textarea')?.focus());
}

function scrollToMessage(messageId: string) {
  document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function reactToMessage(message: Message, emoji: typeof quickReactions[number]) {
  if (!selected.value || reactionBusyId.value) return;
  reactionBusyId.value = message.id;
  openReactionId.value = null;
  const current = message.reactions?.find((reaction) => reaction.actor === 'channel')?.emoji;
  try {
    await api(`/conversations/${selected.value.id}/messages/${message.id}/reaction`, {
      method: 'PUT',
      body: { emoji: current === emoji ? undefined : emoji },
    });
    feedback.value = current === emoji ? 'Reação removida.' : 'Reação enviada.';
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível enviar a reação.';
  } finally {
    reactionBusyId.value = null;
  }
}

async function copyMessage(message: Message) {
  try {
    await navigator.clipboard.writeText(message.body);
    feedback.value = 'Mensagem copiada.';
  } catch {
    feedback.value = 'O navegador não permitiu copiar a mensagem.';
  }
}

function selectMedia(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!file) return;
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const audioTypes = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac'];
  if (![...imageTypes, ...audioTypes].includes(file.type)) {
    feedback.value = 'Escolha uma imagem JPEG, PNG ou WebP, ou um áudio OGG, MP3, M4A ou AAC.';
    input.value = '';
    return;
  }
  const limit = imageTypes.includes(file.type) ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > limit) {
    feedback.value = imageTypes.includes(file.type) ? 'A imagem deve ter no máximo 10 MiB.' : 'O áudio deve ter no máximo 20 MiB.';
    input.value = '';
    return;
  }
  selectedMedia.value = file;
  if (audioTypes.includes(file.type)) replyBody.value = '';
  feedback.value = '';
}

function clearSelectedMedia() {
  selectedMedia.value = null;
  if (mediaInput.value) mediaInput.value.value = '';
}

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${Math.ceil(bytes / 1024)} KiB`;
}

async function updateStatus(status: ConversationStatus) {
  if (!selected.value) return;
  busy.value = true; feedback.value = '';
  try {
    await api(`/conversations/${selected.value.id}/status`, { method: 'PUT', body: { status } });
    await refresh();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível atualizar a conversa.';
  } finally { busy.value = false; }
}

async function startFollowup() {
  if (!selected.value) return;
  busy.value = true; feedback.value = '';
  try {
    const followup = await api<{ id: string }>('/followups', { method: 'POST', body: { conversationId: selected.value.id } });
    await navigateTo(`/followups?selected=${followup.id}`);
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível iniciar o acompanhamento.';
  } finally { busy.value = false; }
}

async function createMemberFromConversation() {
  if (!selected.value) return;
  busy.value = true; feedback.value = '';
  try {
    const member = await api<{ id: string; name: string }>(`/conversations/${selected.value.id}/member`, {
      method: 'POST', body: memberForm,
    });
    Object.assign(memberForm, { email: '' });
    showMemberForm.value = false;
    feedback.value = `${member.name} foi adicionado. A senha temporária e o link estão na fila de entregas.`;
    await refresh();
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    feedback.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível adicionar este contato como membro.';
  } finally { busy.value = false; }
}

async function loadMedia(conversationId: string, mediaId: string) {
  mediaLoading[mediaId] = true;
  try {
    const blob = await api<Blob>(`/conversations/${conversationId}/media/${mediaId}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    if (selectedId.value !== conversationId) URL.revokeObjectURL(url);
    else mediaUrls[mediaId] = url;
  } catch {
    mediaErrors[mediaId] = true;
  } finally { delete mediaLoading[mediaId]; }
}

function clearMediaUrls() {
  if (import.meta.client) {
    for (const url of Object.values(mediaUrls)) URL.revokeObjectURL(url);
  }
  for (const key of Object.keys(mediaUrls)) delete mediaUrls[key];
  for (const key of Object.keys(mediaErrors)) delete mediaErrors[key];
  for (const key of Object.keys(mediaLoading)) delete mediaLoading[key];
}
</script>

<template>
  <div class="page page--conversations">
    <header class="page-header">
      <div><p class="eyebrow">Atendimento</p><h1>Central de conversas</h1><p class="muted">Cada pastor atende pelo próprio canal, dentro da mesma comunidade.</p></div>
      <div class="conversation-header-actions"><button v-if="canManageChannel" class="button" type="button" @click="showChannelForm = !showChannelForm">⚙ Canais</button><button v-if="canReply" class="button button--primary" type="button" :disabled="!channels?.length" @click="showConversationForm = !showConversationForm">＋ Nova conversa</button></div>
    </header>

    <p v-if="feedback" class="operation-feedback" role="status">{{ feedback }}</p>
    <section v-if="showChannelForm" class="conversation-setup-card">
      <div><p class="eyebrow">Meu número</p><h2>Configurar canal do WhatsApp</h2><p>Para testar com seu WhatsApp atual, escolha a conexão pelo celular e leia o QR. Cada pastor mantém o próprio canal.</p></div>
      <form class="conversation-setup-form" @submit.prevent="createChannel">
        <label class="field"><span>Tipo de conexão</span><select v-model="channelForm.providerKey"><option value="whatsapp_web">WhatsApp via QR Code</option><option value="whatsapp_cloud">Meta Cloud API (oficial)</option><option value="manual">Outro adapter</option></select></label>
        <label class="field"><span>Nome do canal</span><input v-model="channelForm.displayName" minlength="2" maxlength="80" placeholder="WhatsApp do Pr. João" required></label>
        <label class="field"><span>Número</span><input v-model="channelForm.phoneNumber" minlength="8" maxlength="32" placeholder="+55 11 99999-9999" required></label>
        <template v-if="channelForm.providerKey === 'whatsapp_cloud'"><label class="field"><span>ID da conta no provedor</span><input v-model="channelForm.providerAccountId" maxlength="180" placeholder="WhatsApp Business Account ID"></label><label class="field"><span>Variável do segredo</span><input v-model="channelForm.secretReference" pattern="[A-Z][A-Z0-9_]+" maxlength="128" placeholder="WHATSAPP_PASTOR_JOAO_TOKEN"><small>Nunca cole o token: informe a variável de ambiente.</small></label></template>
        <div class="conversation-form-actions"><button class="button" type="button" @click="showChannelForm = false">Cancelar</button><button class="button button--primary" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar canal' }}</button></div>
      </form>
      <div v-if="channels?.length" class="channel-list">
        <article v-for="channel in channels" :key="channel.id" class="channel-card">
          <span class="channel-symbol">◌</span>
          <div class="channel-card__identity"><strong>{{ channel.displayName }}</strong><small>{{ channel.phoneNumber }} · {{ channel.owner.name }}</small><small>{{ channel.providerKey === 'whatsapp_web' ? 'WhatsApp via QR Code' : channel.providerKey === 'whatsapp_cloud' ? 'Meta Cloud API' : channel.providerKey }}</small></div>
          <div class="channel-card__status">
            <span class="badge" :class="(channelConnections[channel.id]?.status ?? channel.status) === 'connected' ? 'badge--published' : (channelConnections[channel.id]?.status ?? channel.status) === 'failed' ? 'badge--cancelled' : 'badge--draft'">{{ channelStatusLabels[channelConnections[channel.id]?.status ?? channel.status] }}</span>
            <template v-if="channel.providerKey === 'whatsapp_web'">
              <button class="button button--small button--primary" type="button" :disabled="busyChannelId === channel.id || ['connecting', 'awaiting_qr', 'disconnecting'].includes(channelConnections[channel.id]?.status ?? channel.status)" @click="connectChannel(channel)">{{ busyChannelId === channel.id ? 'Aguarde…' : (channelConnections[channel.id]?.status ?? channel.status) === 'connected' ? 'Reconectar' : 'Conectar' }}</button>
              <button v-if="['connecting', 'awaiting_qr', 'connected', 'failed'].includes(channelConnections[channel.id]?.status ?? channel.status)" class="button button--small" type="button" :disabled="busyChannelId === channel.id" @click="disconnectChannel(channel)">Desconectar</button>
            </template>
            <button v-if="['configured', 'disconnected'].includes(channelConnections[channel.id]?.status ?? channel.status)" class="button button--small button--danger" type="button" :disabled="busyChannelId === channel.id" @click="requestChannelDeletion(channel)">Excluir</button>
          </div>
          <div v-if="channelQrImages[channel.id]" class="channel-pairing"><img :src="channelQrImages[channel.id]" alt="QR code temporário para conectar o WhatsApp"><div><strong>Leia com o WhatsApp deste número</strong><p>No celular, abra <b>Aparelhos conectados</b>, toque em <b>Conectar um aparelho</b> e aponte a câmera. Este QR expira rapidamente.</p></div></div>
          <p v-if="channelConnections[channel.id]?.failureCode" class="channel-card__error">A conexão falhou ({{ channelConnections[channel.id]?.failureCode }}). Confirme se o worker está ativo e tente novamente.</p>
        </article>
      </div>
      <p class="integration-warning"><strong>Integração via QR Code:</strong> este modo usa um adapter não oficial para conversas individuais. Canais pareados antes da sincronização de histórico precisam ser desconectados e conectados novamente uma vez, com um novo QR. O WhatsApp pode interromper sessões; não use para disparos em massa.</p>
      <NuxtLink v-if="canReadTemplates" to="/communication" class="communication-center-link"><span>✎</span><div><strong>Modelos e lembretes ficam na Central de comunicação</strong><small>Edite modelos locais, consulte o catálogo da Meta e habilite o uso nos eventos.</small></div><b>Ir para a central →</b></NuxtLink>
    </section>

    <section v-if="showConversationForm" class="conversation-setup-card">
      <div><p class="eyebrow">Contato</p><h2>Iniciar conversa</h2><p>O contato ficará associado ao seu canal. O evento é opcional.</p></div>
      <form class="conversation-setup-form" @submit.prevent="startConversation">
        <label class="field"><span>Canal</span><select v-model="conversationForm.channelId" required><option value="" disabled>Selecione seu número</option><option v-for="channel in channels" :key="channel.id" :value="channel.id">{{ channel.displayName }} · {{ channel.phoneNumber }}</option></select></label>
        <label class="field"><span>Nome do contato</span><input v-model="conversationForm.contactName" minlength="2" maxlength="120" required></label>
        <label class="field"><span>Número do contato</span><input v-model="conversationForm.contactAddress" minlength="3" maxlength="180" placeholder="+55 11 98888-8888" required></label>
        <label class="field"><span>Evento (opcional)</span><select v-model="conversationForm.eventId"><option value="">Sem vínculo com evento</option><option v-for="item in events" :key="item.id" :value="item.id">{{ item.title }} · {{ item.owner.name }}</option></select></label>
        <div class="conversation-form-actions"><button class="button" type="button" @click="showConversationForm = false">Cancelar</button><button class="button button--primary" :disabled="busy">Criar conversa</button></div>
      </form>
    </section>

    <section v-if="showMemberForm && selected && !selected.member" class="conversation-setup-card">
      <div><p class="eyebrow">Cadastro de membro</p><h2>Adicionar {{ selected.contact.name }}</h2><p>O nome e o WhatsApp vêm desta conversa. O sistema criará uma senha temporária e um link para o membro completar o perfil.</p><p><strong>WhatsApp:</strong> {{ selected.contact.address }}</p></div>
      <form class="conversation-setup-form" @submit.prevent="createMemberFromConversation">
        <label class="field"><span>E-mail</span><input v-model="memberForm.email" type="email" autocomplete="off" maxlength="254" required></label>
        <div class="integration-warning"><strong>Entrega manual:</strong> depois do cadastro, abra Membros → Entregas de acesso para copiar a mensagem pronta.</div>
        <p class="member-consent-notice">A autorização para a comunidade iniciar novas conversas ficará desativada até o próprio membro consentir.</p>
        <div class="conversation-form-actions"><button class="button" type="button" @click="showMemberForm = false">Cancelar</button><button class="button button--primary" :disabled="busy">{{ busy ? 'Adicionando…' : 'Adicionar membro' }}</button></div>
      </form>
    </section>

    <section class="conversation-workspace">
      <aside class="conversation-inbox">
        <div class="conversation-inbox__tools"><label class="search-field"><span>⌕</span><input v-model="query" type="search" placeholder="Buscar pessoa ou número"></label><div class="filter-bar"><button v-for="option in [{ key: 'active', label: 'Ativas' }, { key: 'open', label: 'Abertas' }, { key: 'waiting', label: 'Aguardando' }, { key: 'resolved', label: 'Resolvidas' }]" :key="option.key" :class="{ active: filter === option.key }" @click="filter = option.key as typeof filter">{{ option.label }}</button></div></div>
        <div v-if="pending" class="conversation-empty">Carregando conversas…</div>
        <div v-else-if="error" class="conversation-empty">Não foi possível carregar a caixa de entrada.</div>
        <div v-else-if="!filtered.length" class="conversation-empty"><span>◌</span><strong>Nenhuma conversa neste filtro</strong><small>Configure seu canal e inicie um atendimento.</small></div>
        <template v-else>
          <button v-for="item in filtered" :key="item.id" type="button" class="conversation-item" :class="{ active: selectedId === item.id }" @click="selectedId = item.id">
            <span class="member-avatar">{{ item.contact.name.charAt(0).toUpperCase() }}</span><span class="conversation-item__body"><span><strong>{{ item.contact.name }}</strong><time>{{ formatter.format(new Date(item.lastMessageAt)) }}</time></span><small>{{ item.event?.title ?? item.contact.address }}</small><p>{{ item.lastMessage ?? 'Conversa iniciada' }}</p></span><span class="conversation-status-dot" :class="`conversation-status-dot--${item.status}`" :title="statusLabels[item.status]" />
          </button>
        </template>
      </aside>

      <article v-if="selected" class="conversation-thread">
        <header><div><h2>{{ selected.contact.name }}</h2><p>{{ selected.contact.address }} · {{ selected.channel.displayName }} ({{ selected.channel.phoneNumber }})</p><small>Responsável: {{ selected.assignedTo.name }}<template v-if="selected.event"> · Evento: {{ selected.event.title }}</template><template v-if="selected.member"> · Membro: {{ selected.member.name }}</template></small></div><div class="conversation-status-actions"><NuxtLink v-if="selected.member" class="button button--small" :to="`/members/${selected.member.id}`">Ver membro</NuxtLink><button v-else-if="canCreateMember" class="button button--small button--primary" type="button" :disabled="busy" @click="showMemberForm = true">＋ Adicionar como membro</button><button v-if="canManageFollowups" class="button button--small" :disabled="busy" @click="startFollowup">♡ Acompanhar</button><template v-if="canAssign"><button v-if="selected.status === 'resolved'" class="button button--small" :disabled="busy" @click="updateStatus('open')">Reabrir</button><button v-else class="button button--small" :disabled="busy" @click="updateStatus('resolved')">✓ Resolver</button></template></div></header>
        <div class="conversation-messages">
          <p v-if="messagesPending" class="conversation-day">Carregando mensagens…</p>
          <p v-else-if="historySyncingId === selected.id" class="conversation-day">Buscando mensagens anteriores no celular…</p>
          <div v-else-if="!messages?.length" class="conversation-thread-empty"><span>◌</span><p>A conversa começou, mas ainda não há mensagens.</p></div>
          <div v-for="message in messages" :key="message.id" class="message-bubble" :class="message.direction === 'outbound' ? 'message-bubble--outbound' : 'message-bubble--inbound'">
            <div class="message-actions" :class="{ 'message-actions--open': openReactionId === message.id }">
              <button v-if="canReply" type="button" title="Responder esta mensagem" @click="quoteMessage(message)">↩ <span>Responder</span></button>
              <div v-if="canReply" class="message-reaction-picker">
                <button type="button" title="Reagir à mensagem" :disabled="reactionBusyId === message.id" @click="openReactionId = openReactionId === message.id ? null : message.id">☺ <span>Reagir</span></button>
                <div v-if="openReactionId === message.id" class="message-reaction-options">
                  <button v-for="emoji in quickReactions" :key="emoji" type="button" :class="{ active: message.reactions?.some((reaction) => reaction.actor === 'channel' && reaction.emoji === emoji) }" @click="reactToMessage(message, emoji)">{{ emoji }}</button>
                </div>
              </div>
              <button type="button" title="Copiar texto" @click="copyMessage(message)">▣ <span>Copiar</span></button>
            </div>
            <button v-if="message.quotedMessage" type="button" class="message-quote" @click="scrollToMessage(message.quotedMessage.id)">
              <strong>{{ message.quotedMessage.direction === 'outbound' ? 'Você' : selected.contact.name }}</strong>
              <span>{{ message.quotedMessage.body }}</span>
            </button>
            <div v-for="attachment in message.attachments" :key="attachment.id" class="message-attachment">
              <a v-if="attachment.kind === 'image' && mediaUrls[attachment.id]" :href="mediaUrls[attachment.id]" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagem em tamanho original"><img :src="mediaUrls[attachment.id]" :alt="message.body === 'Imagem' ? 'Imagem recebida na conversa' : message.body"></a>
              <audio v-else-if="attachment.kind === 'audio' && mediaUrls[attachment.id]" :src="mediaUrls[attachment.id]" controls preload="metadata">Seu navegador não consegue reproduzir este áudio.</audio>
              <span v-else-if="mediaErrors[attachment.id]" class="message-attachment__error">Mídia indisponível</span>
              <span v-else class="message-attachment__loading">Carregando mídia…</span>
              <a v-if="mediaUrls[attachment.id]" class="message-media-download" :href="mediaUrls[attachment.id]" :download="`mensagem-${message.id}`">↓ Baixar</a>
            </div>
            <p :id="`message-${message.id}`">{{ message.body }}</p>
            <div v-if="message.reactions?.length" class="message-reactions"><span v-for="reaction in message.reactions" :key="reaction.actor" :title="reaction.actor === 'channel' ? 'Reação do canal' : `Reação de ${selected.contact.name}`">{{ reaction.emoji }}</span></div>
            <small>{{ formatter.format(new Date(message.createdAt)) }} · {{ messageStatusLabels[message.status] }}<template v-if="message.sentBy"> · {{ message.sentBy }}</template></small>
          </div>
        </div>
        <form v-if="canReply" class="conversation-composer" @submit.prevent="reply">
          <div v-if="replyingTo" class="composer-reply">
            <span>↩</span><span><strong>Respondendo a {{ replyingTo.direction === 'outbound' ? 'você' : selected.contact.name }}</strong><small>{{ replyingTo.body }}</small></span>
            <button type="button" aria-label="Cancelar resposta" @click="replyingTo = null">×</button>
          </div>
          <div v-if="selectedMedia" class="composer-attachment">
            <span class="composer-attachment__icon">{{ selectedMedia.type.startsWith('image/') ? '▧' : '♪' }}</span>
            <span><strong>{{ selectedMedia.name }}</strong><small>{{ formatFileSize(selectedMedia.size) }} · {{ selectedMedia.type.startsWith('image/') ? 'Imagem' : 'Áudio' }}</small></span>
            <button type="button" aria-label="Remover anexo" title="Remover anexo" @click="clearSelectedMedia">×</button>
          </div>
          <textarea
            v-model="replyBody"
            rows="3"
            :maxlength="selectedMedia?.type.startsWith('image/') ? 4000 : 10000"
            :disabled="Boolean(selectedMedia?.type.startsWith('audio/'))"
            :placeholder="selectedMedia?.type.startsWith('image/') ? 'Adicione uma legenda (opcional)…' : selectedMedia?.type.startsWith('audio/') ? 'O áudio será enviado sem texto adicional.' : 'Escreva uma resposta…'"
          />
          <div class="composer-toolbar">
            <div class="composer-toolbar__info">
              <input ref="mediaInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,audio/ogg,audio/mpeg,audio/mp4,audio/aac,.m4a" @change="selectMedia">
              <button class="composer-attach-button" type="button" :disabled="busy" @click="mediaInput?.click()"><span>＋</span> Anexar imagem ou áudio</button>
              <small>{{ selectedMedia?.type.startsWith('audio/') ? 'Áudio de até 20 MiB.' : selectedMedia?.type.startsWith('image/') ? 'Imagem de até 10 MiB; a legenda é opcional.' : 'JPEG, PNG, WebP, OGG, MP3, M4A ou AAC.' }}</small>
            </div>
            <button class="button button--primary" :disabled="busy || (!selectedMedia && !replyBody.trim())">{{ busy ? 'Enviando…' : 'Enviar' }}</button>
          </div>
        </form>
      </article>
      <article v-else class="conversation-thread conversation-thread--empty"><span>◌</span><h2>Selecione uma conversa</h2><p>Você acompanha aqui os atendimentos dos seus próprios números. Pessoas responsáveis pela supervisão também podem acompanhar as conversas da comunidade.</p></article>
    </section>
    <ConfirmDialog :open="Boolean(channelToDelete)" :title="`Excluir ${channelToDelete?.displayName ?? 'canal'}?`" :description="channelDeleteError || 'A exclusão só será concluída se o canal estiver desconectado e não possuir conversas ou lembretes vinculados.'" confirm-label="Excluir canal" busy-label="Excluindo…" :busy="Boolean(busyChannelId && channelToDelete)" @cancel="cancelChannelDeletion" @confirm="deleteChannel" />
  </div>
</template>

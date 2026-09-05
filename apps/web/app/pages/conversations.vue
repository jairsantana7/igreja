<script setup lang="ts">
type ConversationStatus = 'open' | 'waiting' | 'resolved';
interface Channel {
  id: string; owner: { id: string; name: string }; providerKey: string; displayName: string;
  phoneNumber: string; providerAccountId: string; secretReference: string | null;
  status: 'configured' | 'connected' | 'disconnected';
}
interface Conversation {
  id: string; channel: { id: string; displayName: string; phoneNumber: string };
  assignedTo: { id: string; name: string }; event: { id: string; title: string } | null;
  contact: { name: string; address: string }; status: ConversationStatus;
  lastMessage: string | null; lastMessageAt: string;
}
interface Message {
  id: string; direction: 'inbound' | 'outbound'; body: string;
  status: 'received' | 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  sentBy: string | null; createdAt: string;
}
interface EventOption { id: string; title: string; owner: { id: string; name: string } }

useHead({ title: 'Conversas' });
const api = useApi();
const auth = useAuth();
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canManageChannel = computed(() => permissions.value.includes('channels.manage_own') || permissions.value.includes('channels.manage_all'));
const canReply = computed(() => permissions.value.includes('conversations.reply'));
const canAssign = computed(() => permissions.value.includes('conversations.assign'));
const { data: conversations, pending, error, refresh } = await useAsyncData('conversations', () => api<Conversation[]>('/conversations'), { server: false });
const { data: channels, refresh: refreshChannels } = await useAsyncData(
  'conversation-channels',
  () => api<Channel[]>('/conversation-channels'),
  { server: false },
);
const { data: events } = await useAsyncData('conversation-event-options', () => api<EventOption[]>('/events'), { server: false });
const selectedId = ref<string | null>(null);
const selected = computed(() => (conversations.value ?? []).find((item) => item.id === selectedId.value) ?? null);
const { data: messages, pending: messagesPending, refresh: refreshMessages } = await useAsyncData(
  'conversation-messages',
  () => selectedId.value ? api<Message[]>(`/conversations/${selectedId.value}/messages`) : Promise.resolve([]),
  { server: false, immediate: false },
);
const filter = ref<'active' | ConversationStatus>('active');
const query = ref('');
const showChannelForm = ref(false);
const showConversationForm = ref(false);
const busy = ref(false);
const feedback = ref('');
const replyBody = ref('');
const channelForm = reactive({ providerKey: 'whatsapp_cloud', displayName: '', phoneNumber: '', providerAccountId: '', secretReference: '' });
const conversationForm = reactive({ channelId: '', contactName: '', contactAddress: '', eventId: '' });
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const statusLabels: Record<ConversationStatus, string> = { open: 'Aberta', waiting: 'Aguardando', resolved: 'Resolvida' };
const filtered = computed(() => (conversations.value ?? []).filter((item) => {
  const term = query.value.trim().toLocaleLowerCase('pt-BR');
  const matchesFilter = filter.value === 'active' ? item.status !== 'resolved' : item.status === filter.value;
  return matchesFilter && (!term || item.contact.name.toLocaleLowerCase('pt-BR').includes(term) || item.contact.address.toLocaleLowerCase('pt-BR').includes(term));
}));

watch(conversations, (items) => {
  if (!selectedId.value && items?.length) selectedId.value = items[0]!.id;
}, { immediate: true });
watch(selectedId, async (id) => {
  if (id) await refreshMessages();
});

async function createChannel() {
  busy.value = true; feedback.value = '';
  try {
    await api('/conversation-channels', { method: 'POST', body: {
      ...channelForm,
      secretReference: channelForm.secretReference || undefined,
    } });
    Object.assign(channelForm, { providerKey: 'whatsapp_cloud', displayName: '', phoneNumber: '', providerAccountId: '', secretReference: '' });
    showChannelForm.value = false;
    feedback.value = 'Canal configurado. Instale e configure o adapter para conectá-lo ao WhatsApp.';
    await refreshChannels();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível configurar o canal.';
  } finally { busy.value = false; }
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
  if (!selected.value || !replyBody.value.trim()) return;
  busy.value = true; feedback.value = '';
  try {
    await api(`/conversations/${selected.value.id}/messages`, { method: 'POST', body: { body: replyBody.value } });
    replyBody.value = '';
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível enfileirar a mensagem.';
    replyBody.value = '';
  } finally {
    await Promise.all([refreshMessages(), refresh()]);
    busy.value = false;
  }
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
</script>

<template>
  <div class="page page--conversations">
    <header class="page-header">
      <div><p class="eyebrow">Atendimento</p><h1>Central de conversas</h1><p class="muted">Cada pastor atende pelo próprio canal, dentro da mesma comunidade.</p></div>
      <div class="conversation-header-actions"><button v-if="canManageChannel" class="button" type="button" @click="showChannelForm = !showChannelForm">⚙ Canais</button><button v-if="canReply" class="button button--primary" type="button" :disabled="!channels?.length" @click="showConversationForm = !showConversationForm">＋ Nova conversa</button></div>
    </header>

    <p v-if="feedback" class="operation-feedback" role="status">{{ feedback }}</p>
    <section v-if="showChannelForm" class="conversation-setup-card">
      <div><p class="eyebrow">Meu número</p><h2>Configurar canal do WhatsApp</h2><p>Credenciais não são armazenadas aqui: informe somente o nome da variável de ambiente usada pelo adapter.</p></div>
      <form class="conversation-setup-form" @submit.prevent="createChannel">
        <label class="field"><span>Nome do canal</span><input v-model="channelForm.displayName" minlength="2" maxlength="80" placeholder="WhatsApp do Pr. João" required></label>
        <label class="field"><span>Número</span><input v-model="channelForm.phoneNumber" minlength="8" maxlength="32" placeholder="+55 11 99999-9999" required></label>
        <label class="field"><span>ID da conta no provedor</span><input v-model="channelForm.providerAccountId" maxlength="180" placeholder="WhatsApp Business Account ID"></label>
        <label class="field"><span>Variável do segredo</span><input v-model="channelForm.secretReference" pattern="[A-Z][A-Z0-9_]+" maxlength="128" placeholder="WHATSAPP_PASTOR_JOAO_TOKEN"><small>Opcional nesta etapa; nunca cole o token.</small></label>
        <div class="conversation-form-actions"><button class="button" type="button" @click="showChannelForm = false">Cancelar</button><button class="button button--primary" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar canal' }}</button></div>
      </form>
      <div v-if="channels?.length" class="channel-list"><article v-for="channel in channels" :key="channel.id"><span class="channel-symbol">◌</span><div><strong>{{ channel.displayName }}</strong><small>{{ channel.phoneNumber }} · {{ channel.owner.name }}</small></div><span class="badge" :class="channel.status === 'connected' ? 'badge--published' : 'badge--draft'">{{ channel.status === 'connected' ? 'Conectado' : channel.status === 'configured' ? 'Configurado' : 'Desconectado' }}</span></article></div>
      <p class="integration-warning"><strong>Status configurado:</strong> o número só envia e recebe mensagens quando uma instalação fornecer o adapter oficial e a fila.</p>
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
        <header><div><h2>{{ selected.contact.name }}</h2><p>{{ selected.contact.address }} · {{ selected.channel.displayName }} ({{ selected.channel.phoneNumber }})</p><small>Responsável: {{ selected.assignedTo.name }}<template v-if="selected.event"> · Evento: {{ selected.event.title }}</template></small></div><div v-if="canAssign" class="conversation-status-actions"><button v-if="selected.status === 'resolved'" class="button button--small" :disabled="busy" @click="updateStatus('open')">Reabrir</button><button v-else class="button button--small" :disabled="busy" @click="updateStatus('resolved')">✓ Resolver</button></div></header>
        <div class="conversation-messages">
          <p v-if="messagesPending" class="conversation-day">Carregando mensagens…</p>
          <div v-else-if="!messages?.length" class="conversation-thread-empty"><span>◌</span><p>A conversa começou, mas ainda não há mensagens.</p></div>
          <div v-for="message in messages" :key="message.id" class="message-bubble" :class="message.direction === 'outbound' ? 'message-bubble--outbound' : 'message-bubble--inbound'">
            <p>{{ message.body }}</p><small>{{ formatter.format(new Date(message.createdAt)) }} · {{ message.status === 'pending' ? 'Pendente' : message.status === 'queued' ? 'Na fila' : message.status }}<template v-if="message.sentBy"> · {{ message.sentBy }}</template></small>
          </div>
        </div>
        <form v-if="canReply" class="conversation-composer" @submit.prevent="reply"><textarea v-model="replyBody" rows="3" maxlength="10000" placeholder="Escreva uma resposta…" required></textarea><div><small>O envio passa pelo adapter e pela fila configurados na instalação.</small><button class="button button--primary" :disabled="busy || !replyBody.trim()">Enviar</button></div></form>
      </article>
      <article v-else class="conversation-thread conversation-thread--empty"><span>◌</span><h2>Selecione uma conversa</h2><p>As conversas dos seus próprios canais aparecem aqui. Quem possui <code>conversations.read_all</code> pode supervisionar toda a comunidade.</p></article>
    </section>
  </div>
</template>

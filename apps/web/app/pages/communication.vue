<script setup lang="ts">
type TemplateStatus = 'draft' | 'active' | 'archived';
type TemplatePurpose = 'registration_confirmation' | 'event_reminder' | 'event_update' | 'event_cancellation' | 'post_event';
interface TemplateVersion { id: string; version: number; subject: string; body: string; variables: string[]; createdAt: string; createdBy: { id: string; name: string } }
interface MessageTemplate { id: string; name: string; purpose: TemplatePurpose; channel: 'email' | 'whatsapp'; status: TemplateStatus; currentVersion: TemplateVersion; versionCount: number; updatedAt: string }
interface Channel { id: string; providerKey: string; displayName: string; phoneNumber: string; status: 'configured' | 'connected' | 'disconnected'; owner: { id: string; name: string } }
interface MetaTemplate { id: string; name: string; language: string; category: string; status: string; bodyText: string | null; variables: string[] }

useHead({ title: 'Comunicação' });
const api = useApi();
const auth = useAuth();
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canManage = computed(() => permissions.value.includes('communications.templates_manage'));
const canReadMeta = computed(() => permissions.value.includes('whatsapp.templates_read'));
const canSyncMeta = computed(() => permissions.value.includes('whatsapp.templates_sync'));
const canReadConversations = computed(() => permissions.value.includes('conversations.read'));
const canReadChannels = computed(() => permissions.value.includes('channels.manage_own') || permissions.value.includes('channels.manage_all') || canReadConversations.value);
const canUseMetaCatalog = computed(() => canReadMeta.value && canReadChannels.value);
const activeTab = ref<'local' | 'meta'>('local');
const { data: templates, pending, error, refresh } = await useAsyncData('communication-templates', () => api<MessageTemplate[]>('/communication/templates'), { server: false });
const { data: channels, refresh: refreshChannels } = await useAsyncData('communication-template-channels', () => canUseMetaCatalog.value ? api<Channel[]>('/conversation-channels') : Promise.resolve([]), { server: false });
const selectedChannelId = ref('');
const { data: metaTemplates, pending: metaPending, error: metaError, refresh: refreshMeta } = await useAsyncData(
  'communication-meta-templates',
  () => selectedChannelId.value && canUseMetaCatalog.value ? api<MetaTemplate[]>(`/conversation-channels/${selectedChannelId.value}/templates`) : Promise.resolve([]),
  { server: false, watch: [selectedChannelId] },
);
const editingId = ref<string | null>(null);
const editorOpen = ref(false);
const saving = ref(false);
const feedback = ref('');
const formError = ref('');
const openHistoryId = ref<string | null>(null);
const versions = ref<TemplateVersion[]>([]);
const versionsPending = ref(false);
const form = reactive({ name: '', purpose: 'event_reminder' as TemplatePurpose, channel: 'whatsapp' as 'email' | 'whatsapp', subject: '', body: '' });
const purposes: Array<{ value: TemplatePurpose; label: string }> = [
  { value: 'registration_confirmation', label: 'Confirmação de inscrição' },
  { value: 'event_reminder', label: 'Lembrete do evento' },
  { value: 'event_update', label: 'Alteração do evento' },
  { value: 'event_cancellation', label: 'Cancelamento' },
  { value: 'post_event', label: 'Após o evento' },
];
const purposeLabels = Object.fromEntries(purposes.map((item) => [item.value, item.label]));
const statusLabels: Record<TemplateStatus, string> = { draft: 'Rascunho', active: 'Ativo', archived: 'Arquivado' };
const metaStatusLabels: Record<string, string> = { APPROVED: 'Aprovado', PENDING: 'Em análise', REJECTED: 'Rejeitado', PAUSED: 'Pausado', DISABLED: 'Desabilitado', IN_APPEAL: 'Em recurso' };
const variables = [
  { key: 'membro.nome', label: 'Nome do membro' },
  { key: 'evento.nome', label: 'Nome do evento' },
  { key: 'evento.data', label: 'Data do evento' },
  { key: 'evento.local', label: 'Local do evento' },
  { key: 'inscricao.link', label: 'Link da inscrição' },
];
const samples: Record<string, string> = { 'membro.nome': 'Mariana', 'evento.nome': 'Encontro de boas-vindas', 'evento.data': '19 de setembro, às 19h', 'evento.local': 'Salão principal', 'inscricao.link': 'comunidade.org/e/encontro' };
const preview = computed(() => variables.reduce((text, variable) => text.replaceAll(`{{${variable.key}}}`, samples[variable.key]!), form.body || 'Sua mensagem aparecerá aqui.'));
const previewSubject = computed(() => variables.reduce((text, variable) => text.replaceAll(`{{${variable.key}}}`, samples[variable.key]!), form.subject));
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const counts = computed(() => ({ active: templates.value?.filter((item) => item.status === 'active').length ?? 0, draft: templates.value?.filter((item) => item.status === 'draft').length ?? 0, versions: templates.value?.reduce((total, item) => total + item.versionCount, 0) ?? 0 }));
const metaChannels = computed(() => (channels.value ?? []).filter((item) => item.providerKey === 'whatsapp_cloud'));

watch(channels, (items) => {
  const official = (items ?? []).filter((item) => item.providerKey === 'whatsapp_cloud');
  if (!official.some((item) => item.id === selectedChannelId.value)) selectedChannelId.value = official[0]?.id ?? '';
}, { immediate: true });

function openCreate() {
  Object.assign(form, { name: '', purpose: 'event_reminder', channel: 'whatsapp', subject: '', body: 'Olá, {{membro.nome}}! Lembramos que {{evento.nome}} será em {{evento.data}}, no local {{evento.local}}.' });
  editingId.value = null; formError.value = ''; editorOpen.value = true;
}
function openEdit(item: MessageTemplate) {
  Object.assign(form, { name: item.name, purpose: item.purpose, channel: item.channel, subject: item.currentVersion.subject, body: item.currentVersion.body });
  editingId.value = item.id; formError.value = ''; editorOpen.value = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function insertVariable(key: string) {
  form.body = `${form.body}${form.body && !form.body.endsWith(' ') ? ' ' : ''}{{${key}}}`;
}
async function saveTemplate() {
  saving.value = true; formError.value = ''; feedback.value = '';
  try {
    await api(editingId.value ? `/communication/templates/${editingId.value}` : '/communication/templates', { method: editingId.value ? 'PUT' : 'POST', body: form });
    feedback.value = editingId.value ? 'Nova versão criada. Lembretes existentes continuam usando a versão anterior até serem atualizados.' : 'Modelo criado como rascunho. Ative-o quando estiver pronto para uso.';
    editorOpen.value = false; await refresh();
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    formError.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível salvar o modelo.';
  } finally { saving.value = false; }
}
async function setStatus(item: MessageTemplate, status: TemplateStatus) {
  feedback.value = '';
  try { await api(`/communication/templates/${item.id}/status`, { method: 'PUT', body: { status } }); await refresh(); feedback.value = `Modelo ${status === 'active' ? 'ativado' : status === 'draft' ? 'pausado' : 'arquivado'}.`; }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível alterar o modelo.'; }
}
async function toggleHistory(item: MessageTemplate) {
  if (openHistoryId.value === item.id) { openHistoryId.value = null; return; }
  openHistoryId.value = item.id; versionsPending.value = true;
  try { versions.value = await api<TemplateVersion[]>(`/communication/templates/${item.id}/versions`); }
  finally { versionsPending.value = false; }
}
async function syncMeta() {
  if (!selectedChannelId.value) return;
  saving.value = true; feedback.value = '';
  try { await api(`/conversation-channels/${selectedChannelId.value}/templates/sync`, { method: 'POST' }); await Promise.all([refreshMeta(), refreshChannels()]); feedback.value = 'Catálogo oficial atualizado com os status informados pela Meta.'; }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível sincronizar com a Meta.'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="page page--communication">
    <header class="page-header"><div><p class="eyebrow">Central de comunicação</p><h1>Modelos de mensagem</h1><p class="muted">Crie o texto uma vez, revise com segurança e habilite o uso dentro de cada evento.</p></div><div class="communication-header-actions"><NuxtLink v-if="canReadConversations" to="/conversations" class="button">◌ Abrir conversas</NuxtLink><button v-if="canManage" class="button button--primary" type="button" @click="openCreate">＋ Novo modelo</button></div></header>
    <p v-if="feedback" class="operation-feedback" role="status">{{ feedback }}</p>
    <nav class="operation-tabs" aria-label="Tipos de modelo"><button :class="{ active: activeTab === 'local' }" @click="activeTab = 'local'">Modelos da comunidade</button><button v-if="canUseMetaCatalog" :class="{ active: activeTab === 'meta' }" @click="activeTab = 'meta'">Catálogo oficial da Meta</button></nav>

    <template v-if="activeTab === 'local'">
      <section v-if="editorOpen" class="message-template-editor">
        <header><div><p class="eyebrow">{{ editingId ? 'Nova versão' : 'Novo modelo' }}</p><h2>{{ editingId ? 'Editar modelo sem alterar mensagens planejadas' : 'Criar um modelo reutilizável' }}</h2><p>{{ editingId ? 'Ao salvar, uma nova versão será criada. O canal original não pode ser alterado.' : 'O modelo começa como rascunho e só aparece nos eventos depois de ser ativado.' }}</p></div><button class="icon-close" type="button" aria-label="Fechar editor" @click="editorOpen = false">×</button></header>
        <form class="message-template-editor__grid" @submit.prevent="saveTemplate">
          <div class="message-template-fields"><div class="form-grid"><label class="field"><span>Nome <b>*</b></span><input v-model="form.name" minlength="3" maxlength="120" placeholder="Ex.: Lembrete um dia antes" required></label><label class="field"><span>Finalidade <b>*</b></span><select v-model="form.purpose"><option v-for="purpose in purposes" :key="purpose.value" :value="purpose.value">{{ purpose.label }}</option></select></label><label class="field"><span>Canal <b>*</b></span><select v-model="form.channel" :disabled="Boolean(editingId)"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select><small v-if="editingId">Crie outro modelo para trocar de canal.</small></label><label class="field"><span>Assunto <template v-if="form.channel === 'email'"><b>*</b></template></span><input v-model="form.subject" maxlength="160" :required="form.channel === 'email'" :disabled="form.channel === 'whatsapp'" placeholder="Assunto do e-mail"></label></div><label class="field"><span>Mensagem <b>*</b></span><textarea v-model="form.body" maxlength="5000" rows="8" required></textarea><small>{{ form.body.length }}/5000 caracteres</small></label><div class="variable-picker"><span>Inserir informação</span><button v-for="variable in variables" :key="variable.key" type="button" @click="insertVariable(variable.key)">＋ {{ variable.label }}</button></div><p v-if="formError" class="alert" role="alert">{{ formError }}</p><div class="access-editor__actions"><button class="button" type="button" @click="editorOpen = false">Cancelar</button><button class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : editingId ? 'Criar nova versão' : 'Salvar rascunho' }}</button></div></div>
          <aside class="message-preview"><p class="eyebrow">Prévia com dados de exemplo</p><div class="message-preview__bubble"><strong v-if="previewSubject">{{ previewSubject }}</strong><p>{{ preview }}</p><small>Agora · ✓✓</small></div><p class="message-preview__hint">As informações entre chaves serão substituídas somente no momento da entrega.</p></aside>
        </form>
      </section>

      <section class="summary-grid summary-grid--compact" aria-label="Resumo dos modelos"><article class="summary-card"><span class="summary-icon green">✓</span><p>Ativos</p><strong>{{ counts.active }}</strong><small>disponíveis nos eventos</small></article><article class="summary-card"><span class="summary-icon gold">✎</span><p>Rascunhos</p><strong>{{ counts.draft }}</strong><small>aguardando revisão</small></article><article class="summary-card"><span class="summary-icon blue">↻</span><p>Versões</p><strong>{{ counts.versions }}</strong><small>histórico preservado</small></article></section>
      <section class="section-block"><div class="section-heading"><div><h2>Biblioteca da comunidade</h2><p class="muted">Modelos ativos podem ser selecionados na aba Comunicação de um evento.</p></div></div><div v-if="pending" class="empty-card">Carregando modelos…</div><div v-else-if="error" class="empty-card"><p>Não foi possível carregar os modelos.</p><button class="button" @click="refresh()">Tentar novamente</button></div><div v-else-if="!templates?.length" class="empty-card"><span class="empty-icon">✎</span><h3>Nenhum modelo cadastrado</h3><p>Comece pelo lembrete que sua comunidade usa com mais frequência.</p><button v-if="canManage" class="button button--primary" @click="openCreate">Criar primeiro modelo</button></div><div v-else class="message-template-list"><article v-for="item in templates" :key="item.id" class="message-template-card"><header><div><div class="event-card__badges"><span class="badge" :class="item.status === 'active' ? 'badge--published' : item.status === 'archived' ? 'badge--cancelled' : 'badge--draft'">{{ statusLabels[item.status] }}</span><span class="badge badge--open">{{ item.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail' }}</span></div><h3>{{ item.name }}</h3><p>{{ purposeLabels[item.purpose] }} · versão {{ item.currentVersion.version }}</p></div><span class="template-version-count">{{ item.versionCount }} {{ item.versionCount === 1 ? 'versão' : 'versões' }}</span></header><div class="message-template-body"><strong v-if="item.currentVersion.subject">{{ item.currentVersion.subject }}</strong><p>{{ item.currentVersion.body }}</p></div><footer><button class="button button--small" type="button" @click="toggleHistory(item)">↻ Histórico</button><template v-if="canManage"><button v-if="item.status !== 'archived'" class="button button--small" type="button" @click="openEdit(item)">✎ Editar</button><button v-if="item.status === 'draft'" class="button button--small button--primary" type="button" @click="setStatus(item, 'active')">Ativar</button><button v-else-if="item.status === 'active'" class="button button--small" type="button" @click="setStatus(item, 'draft')">Pausar</button><button v-else class="button button--small" type="button" @click="setStatus(item, 'draft')">Restaurar</button><button v-if="item.status !== 'archived'" class="button button--small button--danger" type="button" @click="setStatus(item, 'archived')">Arquivar</button></template></footer><div v-if="openHistoryId === item.id" class="template-history"><p v-if="versionsPending">Carregando histórico…</p><ol v-else><li v-for="version in versions" :key="version.id"><span>v{{ version.version }}</span><div><strong>{{ version.createdBy.name }}</strong><small>{{ formatter.format(new Date(version.createdAt)) }}</small><p>{{ version.body }}</p></div></li></ol></div></article></div></section>
    </template>

    <section v-else class="meta-template-catalog"><div class="operation-toolbar"><div><h2>Templates aprovados pela Meta</h2><p>Este catálogo é sincronizado da WABA. O conteúdo e o status não são alterados localmente.</p></div><button v-if="canSyncMeta" class="button button--primary" :disabled="saving || !selectedChannelId" @click="syncMeta">↻ Sincronizar</button></div><label v-if="metaChannels.length" class="field meta-channel-picker"><span>Número conectado pela Cloud API</span><select v-model="selectedChannelId"><option v-for="channel in metaChannels" :key="channel.id" :value="channel.id">{{ channel.displayName }} · {{ channel.phoneNumber }} · {{ channel.owner.name }}</option></select></label><div v-if="!metaChannels.length" class="empty-card"><h3>Nenhum canal oficial configurado</h3><p>Cadastre uma conexão <code>whatsapp_cloud</code> antes de consultar os templates oficiais. Canais manuais ou via WhatsApp Web usam os modelos da comunidade.</p><NuxtLink to="/conversations" class="button">Configurar canal</NuxtLink></div><div v-else-if="metaPending" class="empty-card">Carregando catálogo…</div><div v-else-if="metaError" class="empty-card">Não foi possível carregar os templates armazenados.</div><div v-else-if="!metaTemplates?.length" class="empty-card"><h3>Nenhum template sincronizado</h3><p>Sincronize para consultar os modelos e status informados pela Meta.</p></div><div v-else class="whatsapp-template-list"><article v-for="item in metaTemplates" :key="item.id"><div><strong>{{ item.name }}</strong><small>{{ item.language }} · {{ item.category }}<template v-if="item.variables.length"> · {{ item.variables.length }} variáveis</template></small></div><span class="badge" :class="item.status === 'APPROVED' ? 'badge--published' : item.status === 'REJECTED' ? 'badge--cancelled' : 'badge--draft'">{{ metaStatusLabels[item.status] ?? item.status }}</span><p>{{ item.bodyText ?? 'Template sem corpo textual.' }}</p></article></div></section>
  </div>
</template>

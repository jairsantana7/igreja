<script setup lang="ts">
type EventStatus = 'draft' | 'published' | 'registration_closed' | 'cancelled' | 'completed';
interface ManagedEvent {
  id: string; publicId: string; title: string; description: string; startsAt: string; registrationDeadline: string | null;
  location: string; status: EventStatus; registrationOpen: boolean; capacity: number | null; registrations: number;
  participants: number; attendance: number; currentFormVersion: number; mediaDisplayMode: string;
  owner: { id: string; name: string };
  collaborators: Array<{ id: string; name: string; email: string }>;
  fields: Array<{ id: string; key: string; label: string; type: string; required: boolean; options: string[] }>;
}
interface CollaboratorCandidate { id: string; name: string; email: string }
interface Registration {
  id: string; member: { id: string; name: string; email: string }; status: 'confirmed' | 'cancelled'; formVersion: number;
  registeredAt: string; checkedInAt: string | null; checkedInBy: string | null;
  participants: Array<{ id: string; name: string; sourceType: 'registrant' | 'spouse' | 'child'; checkedInAt: string | null; checkedInBy: string | null }>;
  offerings: Array<{ id: string; name: string; priceCents: number }>;
  answers: Array<{ fieldId: string; label: string; value: unknown }>;
}
interface Communication {
  id: string; audience: 'confirmed' | 'checked_in' | 'not_checked_in'; channel: 'email' | 'whatsapp';
  subject: string; message: string; status: 'draft' | 'queued' | 'sent' | 'failed'; createdAt: string; queuedAt: string | null;
}
interface MessageTemplate {
  id: string; name: string; purpose: string; channel: 'email' | 'whatsapp'; status: 'draft' | 'active' | 'archived';
  currentVersion: { id: string; version: number; subject: string; body: string }; versionCount: number;
}
interface ConversationChannel { id: string; displayName: string; phoneNumber: string; status: string; owner: { id: string; name: string } }
interface EventReminder {
  id: string; audience: Communication['audience']; offsetMinutesBefore: number; enabled: boolean; scheduledFor: string;
  template: { id: string; name: string; versionId: string; version: number; latestVersion: number; status: 'draft' | 'active' | 'archived' };
  channel: { id: string; displayName: string; phoneNumber: string; status: 'configured' | 'connected' | 'disconnected' }; createdAt: string; updatedAt: string;
}
interface AuditEvent { id: string; actorName: string | null; action: 'created' | 'updated' | 'deleted'; resourceType: string; resourceId: string; createdAt: string }
interface AuditPage { items: AuditEvent[]; nextCursor: string | null }

useHead({ title: 'Gestão do evento' });
const route = useRoute();
const api = useApi();
const auth = useAuth();
const eventId = String(route.params.id);
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canUpdate = computed(() => permissions.value.includes('events.update'));
const canPublish = computed(() => permissions.value.includes('events.publish'));
const canReadRegistrations = computed(() => permissions.value.includes('events.registrations_read'));
const canCheckIn = computed(() => permissions.value.includes('events.checkin'));
const canCommunicate = computed(() => permissions.value.includes('events.communicate'));
const canReadMessageTemplates = computed(() => permissions.value.includes('communications.templates_read'));
const canReadReminderChannels = computed(() => permissions.value.includes('channels.manage_own') || permissions.value.includes('channels.manage_all') || permissions.value.includes('conversations.read'));
const canConfigureReminders = computed(() => permissions.value.includes('events.reminders_manage') && canReadMessageTemplates.value && canReadReminderChannels.value);
const canTemplate = computed(() => permissions.value.includes('events.templates_manage'));
const canAudit = computed(() => permissions.value.includes('audit.read'));
const { data: event, pending, error, refresh } = await useAsyncData(`event-${eventId}`, () => api<ManagedEvent>(`/events/${eventId}`), { server: false });
const canShareEvent = computed(() => permissions.value.includes('events.collaborators_manage') && Boolean(event.value) && (permissions.value.includes('events.manage_all') || event.value?.owner.id === auth.session.value?.user.userId));
const { data: collaboratorCandidates } = await useAsyncData(
  `event-${eventId}-collaborator-candidates`,
  () => canShareEvent.value ? api<CollaboratorCandidate[]>(`/events/${eventId}/collaborator-candidates`) : Promise.resolve([]),
  { server: false },
);
const { data: registrations, refresh: refreshRegistrations } = await useAsyncData(
  `event-${eventId}-registrations`,
  () => canReadRegistrations.value ? api<Registration[]>(`/events/${eventId}/registrations`) : Promise.resolve([]),
  { server: false },
);
const { data: communications, refresh: refreshCommunications } = await useAsyncData(
  `event-${eventId}-communications`,
  () => canCommunicate.value ? api<Communication[]>(`/events/${eventId}/communications`) : Promise.resolve([]),
  { server: false },
);
const { data: messageTemplates } = await useAsyncData(
  `event-${eventId}-message-templates`,
  () => canReadMessageTemplates.value ? api<MessageTemplate[]>('/communication/templates') : Promise.resolve([]),
  { server: false },
);
const { data: reminderChannels } = await useAsyncData(
  `event-${eventId}-reminder-channels`,
  () => canConfigureReminders.value ? api<ConversationChannel[]>('/conversation-channels') : Promise.resolve([]),
  { server: false },
);
const { data: reminders, refresh: refreshReminders } = await useAsyncData(
  `event-${eventId}-reminders`,
  () => canConfigureReminders.value ? api<EventReminder[]>(`/events/${eventId}/reminders`) : Promise.resolve([]),
  { server: false },
);
const auditCursor = ref<string | null>(null);
const auditCursorHistory = ref<Array<string | null>>([]);
const { data: audit, pending: auditPending, error: auditError } = await useAsyncData(
  `event-${eventId}-audit`,
  () => canAudit.value ? api<AuditPage>('/audit', { query: { eventId, limit: 25, cursor: auditCursor.value ?? undefined } }) : Promise.resolve({ items: [], nextCursor: null }),
  { server: false, watch: [auditCursor] },
);
const activeTab = ref<'overview' | 'registrations' | 'form' | 'communication' | 'audit'>('overview');
const registrationFilter = ref<'all' | 'present' | 'absent'>('all');
const search = ref('');
const busyId = ref<string | null>(null);
const feedback = ref('');
const templateName = ref('');
const selectedCollaborators = ref<string[]>([]);
const selectedMessageTemplateId = ref('');
const communicationForm = reactive({ audience: 'confirmed' as Communication['audience'], channel: 'whatsapp' as Communication['channel'], subject: '', message: '' });
const reminderEditorOpen = ref(false);
const editingReminderId = ref<string | null>(null);
const reminderToDelete = ref<EventReminder | null>(null);
const reminderForm = reactive({ templateId: '', channelId: '', audience: 'confirmed' as Communication['audience'], offsetMinutesBefore: 1440, enabled: true });
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const statusLabels: Record<EventStatus, string> = { draft: 'Rascunho', published: 'Publicado', registration_closed: 'Inscrições encerradas', cancelled: 'Cancelado', completed: 'Concluído' };
const audienceLabels = { confirmed: 'Inscritos confirmados', checked_in: 'Presentes', not_checked_in: 'Ausentes' } as const;
const typeLabels: Record<string, string> = { short_text: 'Texto curto', long_text: 'Texto longo', single_choice: 'Escolha única', checkbox: 'Confirmação' };
const activeWhatsAppTemplates = computed(() => (messageTemplates.value ?? []).filter((item) => item.status === 'active' && item.channel === 'whatsapp'));
const availableReminderChannels = computed(() => (reminderChannels.value ?? []).filter((item) => item.status !== 'disconnected'));
const filteredRegistrations = computed(() => (registrations.value ?? []).filter((registration) => {
  const term = search.value.toLowerCase().trim();
  const matchesText = !term || registration.member.name.toLowerCase().includes(term) || registration.member.email.toLowerCase().includes(term) || registration.participants.some((person) => person.name.toLowerCase().includes(term));
  const hasAttendance = registration.participants.some((person) => person.checkedInAt);
  const matchesStatus = registrationFilter.value === 'all' || (registrationFilter.value === 'present' ? hasAttendance : !hasAttendance);
  return matchesText && matchesStatus;
}));
watch(event, (value) => { selectedCollaborators.value = value?.collaborators.map((item) => item.id) ?? []; }, { immediate: true });

function applyMessageTemplate() {
  const selected = messageTemplates.value?.find((item) => item.id === selectedMessageTemplateId.value);
  if (!selected) return;
  communicationForm.channel = selected.channel;
  communicationForm.subject = selected.currentVersion.subject;
  communicationForm.message = selected.currentVersion.body;
}
function openReminderCreate() {
  Object.assign(reminderForm, { templateId: activeWhatsAppTemplates.value[0]?.id ?? '', channelId: availableReminderChannels.value[0]?.id ?? '', audience: 'confirmed', offsetMinutesBefore: 1440, enabled: true });
  editingReminderId.value = null; reminderEditorOpen.value = true;
}
function openReminderEdit(item: EventReminder) {
  Object.assign(reminderForm, { templateId: item.template.id, channelId: item.channel.id, audience: item.audience, offsetMinutesBefore: item.offsetMinutesBefore, enabled: item.enabled });
  editingReminderId.value = item.id; reminderEditorOpen.value = true;
}
async function saveReminder() {
  busyId.value = 'reminder'; feedback.value = '';
  try {
    await api(editingReminderId.value ? `/events/${eventId}/reminders/${editingReminderId.value}` : `/events/${eventId}/reminders`, { method: editingReminderId.value ? 'PUT' : 'POST', body: reminderForm });
    feedback.value = editingReminderId.value ? 'Lembrete atualizado com a versão mais recente do modelo escolhido.' : 'Lembrete configurado para este evento.';
    reminderEditorOpen.value = false; await refreshReminders();
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível salvar o lembrete.'; }
  finally { busyId.value = null; }
}
async function deleteReminder() {
  if (!reminderToDelete.value) return;
  busyId.value = reminderToDelete.value.id;
  try { await api(`/events/${eventId}/reminders/${reminderToDelete.value.id}`, { method: 'DELETE' }); reminderToDelete.value = null; await refreshReminders(); feedback.value = 'Lembrete removido do evento.'; }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível remover o lembrete.'; }
  finally { busyId.value = null; }
}
function offsetLabel(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'dia' : 'dias'} antes`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'} antes`;
  return `${minutes} minutos antes`;
}

function nextAuditPage() {
  if (!audit.value?.nextCursor) return;
  auditCursorHistory.value.push(auditCursor.value);
  auditCursor.value = audit.value.nextCursor;
}
function previousAuditPage() { auditCursor.value = auditCursorHistory.value.pop() ?? null; }

async function changeLifecycle(action: 'close-registrations' | 'complete') {
  busyId.value = action; feedback.value = '';
  try { await api(`/events/${eventId}/${action}`, { method: 'POST' }); await refresh(); }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível alterar o evento.'; }
  finally { busyId.value = null; }
}

async function toggleCheckIn(registration: Registration) {
  busyId.value = registration.id; feedback.value = '';
  try {
    await api(`/events/${eventId}/registrations/${registration.id}/check-in`, { method: registration.checkedInAt ? 'DELETE' : 'POST' });
    await Promise.all([refreshRegistrations(), refresh()]);
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível atualizar a presença.'; }
  finally { busyId.value = null; }
}

async function toggleParticipantCheckIn(registration: Registration, participant: Registration['participants'][number]) {
  busyId.value = participant.id; feedback.value = '';
  try {
    await api(`/events/${eventId}/registrations/${registration.id}/participants/${participant.id}/check-in`, {
      method: participant.checkedInAt ? 'DELETE' : 'POST',
    });
    await Promise.all([refreshRegistrations(), refresh()]);
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível atualizar a presença desta pessoa.'; }
  finally { busyId.value = null; }
}

function checkedParticipantCount(registration: Registration) {
  return registration.participants.filter((person) => person.checkedInAt).length;
}

function allParticipantsChecked(registration: Registration) {
  return Boolean(registration.participants.length) && checkedParticipantCount(registration) === registration.participants.length;
}

async function saveTemplate() {
  if (!templateName.value.trim()) return;
  busyId.value = 'template'; feedback.value = '';
  try { await api(`/events/${eventId}/template`, { method: 'POST', body: { name: templateName.value } }); feedback.value = 'Modelo salvo e disponível na criação de eventos.'; templateName.value = ''; }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível salvar o modelo.'; }
  finally { busyId.value = null; }
}

async function createCommunication() {
  busyId.value = 'communication'; feedback.value = '';
  try {
    await api(`/events/${eventId}/communications`, { method: 'POST', body: communicationForm });
    communicationForm.subject = ''; communicationForm.message = '';
    await refreshCommunications();
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível salvar a comunicação.'; }
  finally { busyId.value = null; }
}

async function saveCollaborators() {
  busyId.value = 'collaborators'; feedback.value = '';
  try {
    await api(`/events/${eventId}/collaborators`, { method: 'PUT', body: { userIds: selectedCollaborators.value } });
    await refresh();
    feedback.value = 'Equipe do evento atualizada.';
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível atualizar a equipe.'; }
  finally { busyId.value = null; }
}

async function queueCommunication(item: Communication) {
  busyId.value = item.id; feedback.value = '';
  try { await api(`/events/${eventId}/communications/${item.id}/queue`, { method: 'POST' }); await refreshCommunications(); }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Nenhum adaptador de fila está disponível nesta instalação.'; }
  finally { busyId.value = null; }
}

function exportCsv() {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['Responsável', 'E-mail', 'Participantes', 'Opções', 'Situação', 'Presença', 'Inscrição', 'Versão do formulário']];
  for (const item of filteredRegistrations.value) rows.push([
    item.member.name, item.member.email, item.participants.map((person) => person.name).join(', '), item.offerings.map((offering) => offering.name).join(', '), item.status === 'confirmed' ? 'Confirmada' : 'Cancelada',
    item.checkedInAt ? 'Presente' : 'Não registrado', formatter.format(new Date(item.registeredAt)), String(item.formVersion),
  ]);
  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escape).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `inscricoes-${event.value?.title ?? 'evento'}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

function answerText(value: unknown) { return typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value ?? '—'); }
</script>

<template>
  <div class="page page--event-operations">
    <div v-if="pending" class="empty-card">Carregando central do evento…</div>
    <div v-else-if="error || !event" class="empty-card"><p>Não foi possível carregar este evento.</p><NuxtLink to="/events" class="button">Voltar para eventos</NuxtLink></div>
    <template v-else>
      <header class="event-operations-header">
        <div><NuxtLink to="/events" class="back-link">← Todos os eventos</NuxtLink><div class="event-card__badges"><span class="badge" :class="`badge--${event.status}`">{{ statusLabels[event.status] }}</span><span v-if="event.registrationOpen" class="badge badge--open">Inscrições abertas</span></div><h1>{{ event.title }}</h1><p>{{ formatter.format(new Date(event.startsAt)) }}<template v-if="event.location"> · {{ event.location }}</template> · Responsável: {{ event.owner.name }}</p></div>
        <div class="event-operations-header__actions"><NuxtLink v-if="canUpdate" :to="`/events/${event.id}/edit`" class="button">✎ Editar</NuxtLink><NuxtLink v-if="event.status === 'published'" :to="`/e/${event.publicId}`" target="_blank" rel="noopener noreferrer" class="button button--primary">↗ Página pública</NuxtLink></div>
      </header>

      <p v-if="feedback" class="operation-feedback" role="status">{{ feedback }}</p>
      <nav class="operation-tabs" aria-label="Áreas do evento">
        <button v-for="tab in [
          { key: 'overview', label: 'Visão geral', show: true },
          { key: 'registrations', label: 'Inscrições', show: canReadRegistrations },
          { key: 'form', label: 'Formulário', show: true },
          { key: 'communication', label: 'Comunicação', show: canCommunicate || canConfigureReminders },
          { key: 'audit', label: 'Auditoria', show: canAudit },
        ].filter((item) => item.show)" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key as typeof activeTab">{{ tab.label }}</button>
      </nav>

      <section v-if="activeTab === 'overview'" class="operation-panel">
        <div class="operation-metrics"><article><span>Inscrições</span><strong>{{ event.registrations }}</strong><small>{{ event.participants }} {{ event.participants === 1 ? 'pessoa confirmada' : 'pessoas confirmadas' }}</small></article><article><span>Presenças</span><strong>{{ event.attendance }}</strong><small>{{ event.participants ? Math.round(event.attendance / event.participants * 100) : 0 }}% dos participantes</small></article><article><span>Ausências</span><strong>{{ Math.max(event.participants - event.attendance, 0) }}</strong><small>pessoas sem check-in</small></article></div>
        <div class="operation-grid">
          <article class="operation-card"><p class="eyebrow">Ciclo de vida</p><h2>Operação do evento</h2><p>Controle a abertura das inscrições e marque o evento como concluído sem perder o histórico.</p><div class="operation-actions"><button v-if="canPublish && event.status === 'published'" class="button" :disabled="Boolean(busyId)" @click="changeLifecycle('close-registrations')">Fechar inscrições</button><button v-if="canPublish && ['published', 'registration_closed'].includes(event.status)" class="button button--primary" :disabled="Boolean(busyId)" @click="changeLifecycle('complete')">Concluir evento</button></div></article>
          <article v-if="canTemplate" class="operation-card"><p class="eyebrow">Reutilização</p><h2>Salvar como modelo</h2><p>Reaproveite descrição, local, capacidade e formulário em um novo evento.</p><form class="inline-operation-form" @submit.prevent="saveTemplate"><label class="field"><span>Nome do modelo</span><input v-model="templateName" maxlength="120" placeholder="Ex.: Encontro mensal" required></label><button class="button" :disabled="busyId === 'template'">Salvar modelo</button></form></article>
          <article class="operation-card event-team-card"><p class="eyebrow">Responsabilidade</p><h2>Equipe do evento</h2><p><strong>{{ event.owner.name }}</strong> é o responsável. Colaboradores podem operar somente este evento conforme as permissões do papel.</p><div v-if="event.collaborators.length" class="event-team-current"><span v-for="person in event.collaborators" :key="person.id" class="role-chip">{{ person.name }}</span></div><form v-if="canShareEvent" class="event-team-form" @submit.prevent="saveCollaborators"><p v-if="!collaboratorCandidates?.length" class="muted">Não há outros usuários com acesso a eventos disponíveis.</p><label v-for="person in collaboratorCandidates" :key="person.id" class="permission-option"><input v-model="selectedCollaborators" type="checkbox" :value="person.id"><span><strong>{{ person.name }}</strong><code>{{ person.email }}</code></span></label><button class="button" :disabled="busyId === 'collaborators'">Salvar equipe</button></form></article>
        </div>
      </section>

      <section v-else-if="activeTab === 'registrations'" class="operation-panel">
        <div class="operation-toolbar"><div><h2>Inscrições e presença</h2><p>{{ filteredRegistrations.length }} registros neste filtro</p></div><button class="button" @click="exportCsv">⇩ Exportar CSV</button></div>
        <div class="registration-controls"><label class="search-field"><span>⌕</span><input v-model="search" placeholder="Buscar por nome ou e-mail"></label><div class="filter-bar"><button v-for="option in [{ key: 'all', label: 'Todos' }, { key: 'present', label: 'Presentes' }, { key: 'absent', label: 'Sem check-in' }]" :key="option.key" :class="{ active: registrationFilter === option.key }" @click="registrationFilter = option.key as typeof registrationFilter">{{ option.label }}</button></div></div>
        <div v-if="!filteredRegistrations.length" class="empty-card"><span class="empty-icon">✓</span><h3>Nenhuma inscrição neste filtro</h3><p>As confirmações aparecerão aqui.</p></div>
        <div v-else class="registration-operations-list"><article v-for="registration in filteredRegistrations" :key="registration.id" class="registration-operation"><span class="member-avatar">{{ registration.member.name.charAt(0).toUpperCase() }}</span><div class="registration-operation__identity"><strong>{{ registration.member.name }}</strong><small>{{ registration.member.email }} · inscrição {{ formatter.format(new Date(registration.registeredAt)) }}</small><div v-if="registration.participants.length" class="registration-participants"><button v-for="person in registration.participants" :key="person.id" type="button" :class="{ checked: person.checkedInAt }" :disabled="!canCheckIn || busyId === person.id" :title="person.checkedInAt ? 'Desfazer presença' : 'Confirmar presença'" @click="toggleParticipantCheckIn(registration, person)">{{ person.name }}<b>{{ person.checkedInAt ? ' ✓' : ' +' }}</b></button></div><p v-if="registration.offerings.length" class="registration-offerings">Opções: {{ registration.offerings.map((offering) => offering.name).join(' · ') }}</p><details v-if="registration.answers.length"><summary>Ver respostas · formulário v{{ registration.formVersion }}</summary><dl><div v-for="answer in registration.answers" :key="answer.fieldId"><dt>{{ answer.label }}</dt><dd>{{ answerText(answer.value) }}</dd></div></dl></details></div><div class="attendance-state" :class="{ present: checkedParticipantCount(registration) }"><strong>{{ checkedParticipantCount(registration) }}/{{ registration.participants.length || 1 }} presentes</strong><small>{{ checkedParticipantCount(registration) ? 'Presença registrada por pessoa' : 'check-in não realizado' }}</small></div><button v-if="canCheckIn && registration.status === 'confirmed'" class="button button--small" :class="allParticipantsChecked(registration) ? 'button--danger' : 'button--primary'" :disabled="busyId === registration.id" @click="toggleCheckIn({ ...registration, checkedInAt: allParticipantsChecked(registration) ? registration.checkedInAt || new Date().toISOString() : null })">{{ allParticipantsChecked(registration) ? 'Desfazer todos' : 'Confirmar todos' }}</button></article></div>
      </section>

      <section v-else-if="activeTab === 'form'" class="operation-panel"><div class="operation-toolbar"><div><h2>Formulário de inscrição</h2><p>Versão atual {{ event.currentFormVersion }} · novas confirmações guardam esta versão.</p></div><NuxtLink v-if="canUpdate" :to="`/events/${event.id}/edit`" class="button">Editar formulário</NuxtLink></div><div v-if="!event.fields.length" class="empty-card"><span class="empty-icon">☷</span><h3>Sem perguntas adicionais</h3><p>Nome e e-mail continuam sendo coletados pela conta.</p></div><ol v-else class="form-version-list"><li v-for="(field, index) in event.fields" :key="field.id"><span>{{ index + 1 }}</span><div><strong>{{ field.label }}</strong><small>{{ typeLabels[field.type] ?? field.type }} · {{ field.required ? 'Obrigatório' : 'Opcional' }}</small><p v-if="field.options.length">{{ field.options.join(' · ') }}</p></div></li></ol></section>

      <section v-else-if="activeTab === 'communication'" class="operation-panel communication-event-panel">
        <div class="operation-toolbar"><div><h2>Comunicação com participantes</h2><p>Ative lembretes para este evento ou prepare uma mensagem pontual.</p></div><NuxtLink v-if="canReadMessageTemplates" to="/communication" class="button">✎ Gerenciar modelos</NuxtLink></div>

        <section v-if="canConfigureReminders" class="event-reminders-section">
          <header><div><p class="eyebrow">Automação do evento</p><h3>Lembretes programados</h3><p>O modelo e o canal são habilitados globalmente; cada regra abaixo precisa ser ativada separadamente.</p></div><button v-if="activeWhatsAppTemplates.length && availableReminderChannels.length" class="button button--primary" type="button" @click="openReminderCreate">＋ Novo lembrete</button></header>
          <div v-if="!activeWhatsAppTemplates.length || !availableReminderChannels.length" class="reminder-prerequisites">
            <div :class="{ complete: activeWhatsAppTemplates.length }"><span>{{ activeWhatsAppTemplates.length ? '✓' : '1' }}</span><div><strong>Modelo ativo</strong><small>{{ activeWhatsAppTemplates.length ? `${activeWhatsAppTemplates.length} disponíveis` : 'Crie e ative um modelo de WhatsApp na Central de comunicação.' }}</small></div></div>
            <div :class="{ complete: availableReminderChannels.length }"><span>{{ availableReminderChannels.length ? '✓' : '2' }}</span><div><strong>Canal configurado</strong><small>{{ availableReminderChannels.length ? `${availableReminderChannels.length} disponíveis` : 'Configure ou reconecte o número do pastor na Central de conversas.' }}</small></div></div>
          </div>
          <form v-if="reminderEditorOpen" class="reminder-editor" @submit.prevent="saveReminder">
            <div class="reminder-editor__heading"><div><p class="eyebrow">{{ editingReminderId ? 'Editar regra' : 'Nova regra' }}</p><h4>{{ editingReminderId ? 'Atualizar lembrete' : 'Quando devemos lembrar?' }}</h4><p v-if="editingReminderId">Salvar novamente adota a versão mais recente do modelo selecionado.</p></div><button class="icon-close" type="button" aria-label="Fechar" @click="reminderEditorOpen = false">×</button></div>
            <div class="reminder-editor__fields"><label class="field"><span>Modelo de mensagem</span><select v-model="reminderForm.templateId" required><option value="" disabled>Selecione</option><option v-for="item in activeWhatsAppTemplates" :key="item.id" :value="item.id">{{ item.name }} · v{{ item.currentVersion.version }}</option></select></label><label class="field"><span>Número responsável</span><select v-model="reminderForm.channelId" required><option value="" disabled>Selecione</option><option v-for="channel in availableReminderChannels" :key="channel.id" :value="channel.id">{{ channel.displayName }} · {{ channel.phoneNumber }}</option></select></label><label class="field"><span>Público</span><select v-model="reminderForm.audience"><option value="confirmed">Inscritos confirmados</option><option value="checked_in">Presentes</option><option value="not_checked_in">Ausentes</option></select></label><label class="field"><span>Antecedência</span><select v-model.number="reminderForm.offsetMinutesBefore"><option :value="60">1 hora antes</option><option :value="180">3 horas antes</option><option :value="720">12 horas antes</option><option :value="1440">1 dia antes</option><option :value="2880">2 dias antes</option><option :value="10080">7 dias antes</option></select></label></div>
            <label class="reminder-enable"><input v-model="reminderForm.enabled" type="checkbox"><span aria-hidden="true"></span><div><strong>Deixar esta regra ativa</strong><small>Desmarque para salvar a configuração sem permitir que o scheduler a processe.</small></div></label>
            <footer><button class="button" type="button" @click="reminderEditorOpen = false">Cancelar</button><button class="button button--primary" :disabled="busyId === 'reminder'">{{ busyId === 'reminder' ? 'Salvando…' : 'Salvar lembrete' }}</button></footer>
          </form>
          <div v-if="reminders?.length" class="event-reminder-list"><article v-for="item in reminders" :key="item.id"><div class="reminder-time"><strong>{{ offsetLabel(item.offsetMinutesBefore) }}</strong><small>{{ formatter.format(new Date(item.scheduledFor)) }}</small></div><div class="reminder-details"><div class="event-card__badges"><span class="badge" :class="item.enabled && item.template.status === 'active' && item.channel.status !== 'disconnected' ? 'badge--published' : 'badge--draft'">{{ !item.enabled ? 'Regra pausada' : item.template.status !== 'active' ? 'Modelo pausado' : item.channel.status === 'disconnected' ? 'Canal desconectado' : 'Regra ativa' }}</span><span v-if="item.template.version < item.template.latestVersion" class="badge badge--open">Atualização disponível</span></div><h4>{{ item.template.name }} · v{{ item.template.version }}</h4><p>{{ audienceLabels[item.audience] }} · {{ item.channel.displayName }} · {{ item.channel.phoneNumber }}</p></div><div class="reminder-actions"><button class="button button--small" type="button" @click="openReminderEdit(item)">✎ Editar</button><button class="button button--small button--danger" type="button" @click="reminderToDelete = item">Remover</button></div></article></div><div v-else-if="activeWhatsAppTemplates.length && availableReminderChannels.length" class="form-empty">Nenhum lembrete configurado para este evento.</div>
        </section>

        <section v-if="canCommunicate" class="manual-communication-section"><header><div><p class="eyebrow">Mensagem pontual</p><h3>Preparar rascunho</h3><p>Use um modelo como ponto de partida ou escreva uma mensagem exclusiva deste evento.</p></div></header><div class="operation-grid"><form class="operation-card communication-form" @submit.prevent="createCommunication"><div v-if="canReadMessageTemplates" class="inline-operation-form"><label class="field"><span>Começar com um modelo</span><select v-model="selectedMessageTemplateId"><option value="">Mensagem em branco</option><option v-for="item in messageTemplates?.filter(template => template.status === 'active')" :key="item.id" :value="item.id">{{ item.name }} · {{ item.channel }}</option></select></label><button class="button" type="button" :disabled="!selectedMessageTemplateId" @click="applyMessageTemplate">Aplicar</button></div><label class="field"><span>Público</span><select v-model="communicationForm.audience"><option value="confirmed">Inscritos confirmados</option><option value="checked_in">Presentes</option><option value="not_checked_in">Ausentes</option></select></label><label class="field"><span>Canal</span><select v-model="communicationForm.channel"><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select></label><label class="field"><span>Assunto</span><input v-model="communicationForm.subject" maxlength="160" placeholder="Assunto da mensagem"></label><label class="field"><span>Mensagem</span><textarea v-model="communicationForm.message" maxlength="5000" rows="5" required></textarea></label><button class="button button--primary" :disabled="busyId === 'communication'">Salvar rascunho</button></form><div class="communication-list"><article v-for="item in communications" :key="item.id" class="operation-card"><div class="event-card__badges"><span class="badge badge--draft">{{ item.channel }}</span><span class="badge" :class="item.status === 'queued' ? 'badge--published' : 'badge--draft'">{{ item.status === 'draft' ? 'Rascunho' : item.status === 'queued' ? 'Na fila' : item.status }}</span></div><h3>{{ item.subject || 'Mensagem sem assunto' }}</h3><p>{{ item.message }}</p><small>{{ audienceLabels[item.audience] }} · {{ formatter.format(new Date(item.createdAt)) }}</small><button v-if="item.status === 'draft'" class="button button--small" :disabled="busyId === item.id" @click="queueCommunication(item)">Enfileirar envio</button></article><div v-if="!communications?.length" class="empty-card"><p>Nenhuma comunicação preparada.</p></div></div></div></section>
        <p class="integration-warning"><strong>Entrega segura:</strong> estas regras ficam prontas e auditadas, mas nenhum envio acontece enquanto a instalação não configurar scheduler, fila e adapter de canal.</p>
      </section>

      <section v-else class="operation-panel"><div class="operation-toolbar"><div><h2>Auditoria deste evento</h2><p>Alterações administrativas, check-ins, versões e comunicações relacionadas.</p></div></div><div v-if="auditPending" class="empty-card">Carregando auditoria…</div><div v-else-if="auditError" class="empty-card">Não foi possível carregar a auditoria.</div><ol v-else-if="audit?.items.length" class="audit-list"><li v-for="item in audit.items" :key="item.id" class="audit-item"><span class="audit-item__icon" :class="`audit-item__icon--${item.action}`">{{ item.action === 'created' ? '＋' : item.action === 'updated' ? '✎' : '−' }}</span><div class="audit-item__body"><p><strong>{{ item.actorName ?? 'Processo do sistema' }}</strong> {{ item.action === 'created' ? 'criou' : item.action === 'updated' ? 'editou' : 'excluiu' }} <strong>{{ item.resourceType.replaceAll('_', ' ') }}</strong>.</p><small>{{ formatter.format(new Date(item.createdAt)) }}</small></div></li></ol><div v-else class="empty-card"><p>Nenhuma atividade encontrada para este evento.</p></div><nav v-if="auditCursorHistory.length || audit?.nextCursor" class="pagination" aria-label="Paginação da auditoria do evento"><button class="button" :disabled="auditPending || !auditCursorHistory.length" @click="previousAuditPage">← Anterior</button><span>Página {{ auditCursorHistory.length + 1 }}</span><button class="button" :disabled="auditPending || !audit?.nextCursor" @click="nextAuditPage">Próxima →</button></nav></section>
    </template>
    <ConfirmDialog :open="Boolean(reminderToDelete)" title="Remover este lembrete?" description="A regra será removida deste evento. O modelo e seu histórico continuarão disponíveis na Central de comunicação." confirm-label="Remover lembrete" :busy="Boolean(busyId && reminderToDelete)" @cancel="reminderToDelete = null" @confirm="deleteReminder" />
  </div>
</template>

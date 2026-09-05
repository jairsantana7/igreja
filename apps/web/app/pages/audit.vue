<script setup lang="ts">
interface AuditEvent {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: 'created' | 'updated' | 'deleted';
  resourceType: string;
  resourceId: string;
  createdAt: string;
}
interface AuditPage { items: AuditEvent[]; nextCursor: string | null }

useHead({ title: 'Auditoria' });
const api = useApi();
const action = ref<'all' | AuditEvent['action']>('all');
const cursor = ref<string | null>(null);
const cursorHistory = ref<Array<string | null>>([]);
const { data, pending, error, refresh } = await useAsyncData('audit-events', () => api<AuditPage>('/audit', { query: {
  limit: 25,
  action: action.value === 'all' ? undefined : action.value,
  cursor: cursor.value ?? undefined,
} }), { server: false, watch: [action, cursor] });
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' });
const actionLabels = { created: 'criou', updated: 'editou', deleted: 'excluiu' } as const;
const resourceLabels: Record<string, string> = {
  users: 'membro',
  roles: 'papel',
  role_permissions: 'permissões do papel',
  user_roles: 'papéis do membro',
  events: 'evento',
  event_form_fields: 'campo do formulário',
  event_registrations: 'inscrição',
  registration_answers: 'respostas da inscrição',
  community_integrations: 'configuração da comunidade',
  event_media: 'imagem do evento',
  whatsapp_message_templates: 'template do WhatsApp',
  communication_templates: 'modelo de comunicação',
  communication_template_versions: 'versão de modelo',
  event_reminder_rules: 'lembrete de evento',
};
const pageNumber = computed(() => cursorHistory.value.length + 1);

function selectAction(value: typeof action.value) {
  if (action.value === value) return;
  cursorHistory.value = [];
  cursor.value = null;
  action.value = value;
}
function nextPage() {
  if (!data.value?.nextCursor) return;
  cursorHistory.value.push(cursor.value);
  cursor.value = data.value.nextCursor;
}
function previousPage() { cursor.value = cursorHistory.value.pop() ?? null; }
function reload() {
  if (cursor.value || cursorHistory.value.length) {
    cursorHistory.value = [];
    cursor.value = null;
  } else refresh();
}
</script>

<template>
  <div class="page page--audit">
    <header class="page-header">
      <div><p class="eyebrow">Transparência</p><h1>Trilha de auditoria</h1><p class="muted">Veja quem criou, editou ou excluiu informações da comunidade.</p></div>
      <button class="button" type="button" :disabled="pending" @click="reload">↻ Atualizar</button>
    </header>

    <section class="section-block">
      <div class="filter-bar" aria-label="Filtrar ações">
        <button v-for="option in [{ key: 'all', label: 'Todas' }, { key: 'created', label: 'Criações' }, { key: 'updated', label: 'Edições' }, { key: 'deleted', label: 'Exclusões' }]" :key="option.key" type="button" :class="{ active: action === option.key }" @click="selectAction(option.key as typeof action)">{{ option.label }}</button>
      </div>
      <div v-if="pending" class="empty-card">Carregando atividades…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar a auditoria.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else-if="!data?.items.length" class="empty-card"><span class="empty-icon">◎</span><h3>Nenhuma atividade encontrada</h3><p>As alterações auditadas aparecerão aqui.</p></div>
      <ol v-else class="audit-list">
        <li v-for="event in data.items" :key="event.id" class="audit-item">
          <span class="audit-item__icon" :class="`audit-item__icon--${event.action}`" aria-hidden="true">{{ event.action === 'created' ? '＋' : event.action === 'updated' ? '✎' : '−' }}</span>
          <div class="audit-item__body">
            <p><strong>{{ event.actorName ?? 'Processo do sistema' }}</strong> {{ actionLabels[event.action] }} <strong>{{ resourceLabels[event.resourceType] ?? event.resourceType }}</strong>.</p>
            <small>{{ formatter.format(new Date(event.createdAt)) }}</small>
          </div>
          <code :title="event.resourceId">{{ event.resourceId.slice(0, 8) }}</code>
        </li>
      </ol>
      <nav v-if="cursorHistory.length || data?.nextCursor" class="pagination" aria-label="Paginação da auditoria"><button class="button" type="button" :disabled="pending || !cursorHistory.length" @click="previousPage">← Anterior</button><span>Página {{ pageNumber }}</span><button class="button" type="button" :disabled="pending || !data?.nextCursor" @click="nextPage">Próxima →</button></nav>
    </section>
  </div>
</template>

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

useHead({ title: 'Auditoria' });
const api = useApi();
const { data, pending, error, refresh } = await useAsyncData('audit-events', () => api<AuditEvent[]>('/audit'), { server: false });
const action = ref('all');
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
};
const filteredEvents = computed(() => action.value === 'all' ? data.value ?? [] : (data.value ?? []).filter((event) => event.action === action.value));
</script>

<template>
  <div class="page page--audit">
    <header class="page-header">
      <div><p class="eyebrow">Transparência</p><h1>Trilha de auditoria</h1><p class="muted">Veja quem criou, editou ou excluiu informações da comunidade.</p></div>
      <button class="button" type="button" :disabled="pending" @click="refresh()">↻ Atualizar</button>
    </header>

    <section class="section-block">
      <div class="filter-bar" aria-label="Filtrar ações">
        <button v-for="option in [{ key: 'all', label: 'Todas' }, { key: 'created', label: 'Criações' }, { key: 'updated', label: 'Edições' }, { key: 'deleted', label: 'Exclusões' }]" :key="option.key" type="button" :class="{ active: action === option.key }" @click="action = option.key">{{ option.label }}</button>
      </div>
      <div v-if="pending" class="empty-card">Carregando atividades…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar a auditoria.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else-if="!filteredEvents.length" class="empty-card"><span class="empty-icon">◎</span><h3>Nenhuma atividade encontrada</h3><p>As alterações auditadas aparecerão aqui.</p></div>
      <ol v-else class="audit-list">
        <li v-for="event in filteredEvents" :key="event.id" class="audit-item">
          <span class="audit-item__icon" :class="`audit-item__icon--${event.action}`" aria-hidden="true">{{ event.action === 'created' ? '＋' : event.action === 'updated' ? '✎' : '−' }}</span>
          <div class="audit-item__body">
            <p><strong>{{ event.actorName ?? 'Processo do sistema' }}</strong> {{ actionLabels[event.action] }} <strong>{{ resourceLabels[event.resourceType] ?? event.resourceType }}</strong>.</p>
            <small>{{ formatter.format(new Date(event.createdAt)) }}</small>
          </div>
          <code :title="event.resourceId">{{ event.resourceId.slice(0, 8) }}</code>
        </li>
      </ol>
      <p v-if="data?.length === 100" class="audit-limit-note">Exibindo as 100 atividades mais recentes.</p>
    </section>
  </div>
</template>

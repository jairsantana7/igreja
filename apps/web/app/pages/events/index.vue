<script setup lang="ts">
type EventStatus = 'draft' | 'published' | 'registration_closed' | 'cancelled' | 'completed';
interface EventListItem {
  id: string;
  publicId: string;
  title: string;
  startsAt: string;
  registrationDeadline: string | null;
  location: string;
  status: EventStatus;
  registrationOpen: boolean;
  capacity: number | null;
  registrations: number;
  participants: number;
  attendance: number;
  owner: { id: string; name: string };
}

useHead({ title: 'Eventos' });
const api = useApi();
const auth = useAuth();
const filter = ref<'all' | 'open' | EventStatus>('all');
const { data: events, pending, error, refresh } = await useAsyncData('events', () => api<EventListItem[]>('/events'), { server: false });
const canCreate = computed(() => auth.session.value?.user.permissions.includes('events.create'));
const canCancel = computed(() => auth.session.value?.user.permissions.includes('events.publish'));
const cancellingId = ref<string | null>(null);
const eventToCancel = ref<EventListItem | null>(null);
const actionMessage = ref('');
const filteredEvents = computed(() => (events.value ?? []).filter((event) => {
  if (filter.value === 'all') return true;
  if (filter.value === 'open') return event.registrationOpen;
  return event.status === filter.value;
}));
const openCount = computed(() => (events.value ?? []).filter((event) => event.registrationOpen).length);
const registrationCount = computed(() => (events.value ?? []).reduce((total, event) => total + event.registrations, 0));
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const statusLabel: Record<EventStatus, string> = { published: 'Publicado', draft: 'Rascunho', registration_closed: 'Inscrições encerradas', completed: 'Concluído', cancelled: 'Cancelado' };

async function cancelEvent() {
  const event = eventToCancel.value;
  if (!event) return;
  cancellingId.value = event.id;
  actionMessage.value = '';
  try {
    await api(`/events/${event.id}/cancel`, { method: 'POST' });
    await refresh();
    eventToCancel.value = null;
  } catch (requestError: any) {
    actionMessage.value = requestError?.data?.message ?? 'Não foi possível cancelar o evento.';
  } finally {
    cancellingId.value = null;
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div><p class="eyebrow">Gestão</p><h1>Eventos</h1><p class="muted">Acompanhe eventos e inscrições confirmadas da comunidade.</p></div>
      <NuxtLink v-if="canCreate" to="/events/new" class="button button--primary">＋ Criar evento</NuxtLink>
    </header>

    <section class="summary-grid summary-grid--compact" aria-label="Resumo dos eventos">
      <article class="summary-card"><span class="summary-icon green">◫</span><p>Eventos cadastrados</p><strong>{{ events?.length ?? '—' }}</strong><small>no total</small></article>
      <article class="summary-card"><span class="summary-icon blue">↗</span><p>Eventos abertos</p><strong>{{ openCount }}</strong><small>recebendo inscrições</small></article>
      <article class="summary-card"><span class="summary-icon gold">✓</span><p>Inscrições</p><strong>{{ registrationCount }}</strong><small>confirmadas</small></article>
    </section>

    <section class="section-block">
      <p v-if="actionMessage" class="alert" role="alert">{{ actionMessage }}</p>
      <div class="filter-bar" aria-label="Filtrar eventos">
        <button v-for="option in [
          { value: 'all', label: 'Todos' },
          { value: 'open', label: 'Abertos' },
          { value: 'published', label: 'Publicados' },
          { value: 'draft', label: 'Rascunhos' },
          { value: 'cancelled', label: 'Cancelados' },
          { value: 'registration_closed', label: 'Inscrições encerradas' },
          { value: 'completed', label: 'Concluídos' },
        ]" :key="option.value" type="button" :class="{ active: filter === option.value }" @click="filter = option.value as typeof filter">
          {{ option.label }}
        </button>
      </div>

      <div v-if="pending" class="empty-card">Carregando eventos…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar os eventos.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else-if="!filteredEvents.length" class="empty-card"><span class="empty-icon">◫</span><h3>Nenhum evento neste filtro</h3><p>Escolha outro filtro ou crie um novo evento.</p></div>
      <div v-else class="event-list">
        <article v-for="event in filteredEvents" :key="event.id" class="event-card">
          <div class="date-tile"><strong>{{ new Date(event.startsAt).getDate() }}</strong><span>{{ new Date(event.startsAt).toLocaleString('pt-BR', { month: 'short' }) }}</span></div>
          <div class="event-card__body">
            <div class="event-card__badges"><span class="badge" :class="`badge--${event.status}`">{{ statusLabel[event.status] }}</span><span v-if="event.registrationOpen" class="badge badge--open">Inscrições abertas</span></div>
            <h3>{{ event.title }}</h3>
            <p>{{ formatter.format(new Date(event.startsAt)) }}<template v-if="event.location"> · {{ event.location }}</template></p>
            <p v-if="event.registrationDeadline" class="event-deadline">Inscrições até {{ formatter.format(new Date(event.registrationDeadline)) }}</p>
            <p class="event-deadline">Responsável: {{ event.owner.name }}</p>
          </div>
          <div class="event-card__meta">
            <strong>{{ event.participants }}</strong><small>pessoas · {{ event.registrations }} inscrições · {{ event.attendance }} presenças</small><small v-if="event.capacity">Capacidade informada: {{ event.capacity }}</small>
            <div class="event-card__actions" aria-label="Ações do evento">
              <NuxtLink :to="`/events/${event.id}`" class="event-action-button event-action-button--primary"><span aria-hidden="true">◎</span> Gerenciar</NuxtLink>
              <NuxtLink v-if="event.status === 'published'" :to="`/e/${event.publicId}`" target="_blank" rel="noopener noreferrer" class="event-action-button event-action-button--secondary"><span aria-hidden="true">↗</span> Abrir</NuxtLink>
              <span v-else class="event-action-placeholder" aria-hidden="true" />
              <button v-if="canCancel && ['draft', 'published', 'registration_closed'].includes(event.status)" type="button" class="event-action-button event-action-button--danger" :disabled="cancellingId === event.id" @click="eventToCancel = event"><span aria-hidden="true">⊘</span> {{ cancellingId === event.id ? 'Cancelando…' : 'Cancelar' }}</button>
              <span v-else class="event-action-placeholder" aria-hidden="true" />
            </div>
          </div>
        </article>
      </div>
    </section>
    <ConfirmDialog :open="Boolean(eventToCancel)" :title="`Cancelar ${eventToCancel?.title ?? 'evento'}?`" description="O link público será fechado imediatamente. Inscrições e respostas existentes continuarão disponíveis no histórico." confirm-label="Cancelar evento" :busy="Boolean(cancellingId)" @cancel="eventToCancel = null" @confirm="cancelEvent" />
  </div>
</template>

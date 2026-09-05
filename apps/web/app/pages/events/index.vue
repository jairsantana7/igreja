<script setup lang="ts">
type EventStatus = 'draft' | 'published' | 'cancelled';
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
}

useHead({ title: 'Eventos' });
const api = useApi();
const auth = useAuth();
const filter = ref<'all' | 'open' | EventStatus>('all');
const { data: events, pending, error, refresh } = await useAsyncData('events', () => api<EventListItem[]>('/events'), { server: false });
const canCreate = computed(() => auth.session.value?.user.permissions.includes('events.create'));
const filteredEvents = computed(() => (events.value ?? []).filter((event) => {
  if (filter.value === 'all') return true;
  if (filter.value === 'open') return event.registrationOpen;
  return event.status === filter.value;
}));
const openCount = computed(() => (events.value ?? []).filter((event) => event.registrationOpen).length);
const registrationCount = computed(() => (events.value ?? []).reduce((total, event) => total + event.registrations, 0));
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const statusLabel: Record<EventStatus, string> = { published: 'Publicado', draft: 'Rascunho', cancelled: 'Cancelado' };
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
      <div class="filter-bar" aria-label="Filtrar eventos">
        <button v-for="option in [
          { value: 'all', label: 'Todos' },
          { value: 'open', label: 'Abertos' },
          { value: 'published', label: 'Publicados' },
          { value: 'draft', label: 'Rascunhos' },
          { value: 'cancelled', label: 'Cancelados' },
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
          </div>
          <div class="event-card__meta"><strong>{{ event.registrations }}</strong><small>inscrições confirmadas</small><small v-if="event.capacity">Capacidade informada: {{ event.capacity }}</small><NuxtLink v-if="event.status === 'published'" :to="`/e/${event.publicId}`">Abrir link ↗</NuxtLink></div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
type EventStatus = 'draft' | 'published' | 'registration_closed' | 'cancelled' | 'completed';
interface AvailableEvent {
  id: string;
  publicId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
  participantCount: number;
}
interface RegisteredEvent {
  registrationId: string;
  publicId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  eventStatus: EventStatus;
  registeredAt: string;
  participants: Array<{ id: string; name: string; sourceType: 'registrant' | 'spouse' | 'child' }>;
  offerings: Array<{ id: string; name: string; priceCents: number }>;
  pixPaymentDeclaredAt: string | null;
}
interface MemberEventsView {
  community: { id: string; name: string };
  available: AvailableEvent[];
  registered: RegisteredEvent[];
}

useHead({ title: 'Meus eventos' });
const api = useApi();
const { data: portal, pending, error, refresh } = await useAsyncData(
  'member-events',
  () => api<MemberEventsView>('/member/events'),
  { server: false },
);
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
const statusLabel: Record<EventStatus, string> = {
  draft: 'Rascunho', published: 'Inscrição confirmada', registration_closed: 'Inscrições encerradas',
  cancelled: 'Cancelado', completed: 'Concluído',
};
const openRegistrations = computed(() => portal.value?.registered.filter((event) => event.eventStatus === 'published').length ?? 0);

function availableSpots(event: AvailableEvent): number | null {
  return event.capacity === null ? null : Math.max(0, event.capacity - event.participantCount);
}
</script>

<template>
  <div class="page page--member-events">
    <header class="page-header">
      <div>
        <p class="eyebrow">Área do membro</p>
        <h1>Meus eventos</h1>
        <p class="muted">Encontre os próximos encontros e consulte tudo o que você já confirmou.</p>
      </div>
    </header>

    <section v-if="portal" class="member-event-summary" aria-label="Resumo">
      <article><span>Próximos eventos</span><strong>{{ portal.available.length }}</strong><small>disponíveis para inscrição</small></article>
      <article><span>Minhas inscrições</span><strong>{{ portal.registered.length }}</strong><small>no seu histórico</small></article>
      <article><span>Confirmações ativas</span><strong>{{ openRegistrations }}</strong><small>em eventos publicados</small></article>
    </section>

    <div v-if="pending" class="empty-card member-event-loading">Carregando seus eventos…</div>
    <div v-else-if="error" class="empty-card member-event-loading">
      <span class="empty-icon">!</span><h3>Não foi possível carregar seus eventos</h3>
      <button class="button" type="button" @click="refresh()">Tentar novamente</button>
    </div>

    <template v-else-if="portal">
      <section class="section-block">
        <div class="section-heading"><div><p class="eyebrow">Participe</p><h2>Eventos disponíveis</h2><p class="muted">Eventos publicados que ainda estão recebendo inscrições.</p></div></div>
        <div v-if="!portal.available.length" class="empty-card">
          <span class="empty-icon">✓</span><h3>Nenhum evento aguardando sua confirmação</h3><p>Quando um novo encontro for publicado, ele aparecerá aqui.</p>
        </div>
        <div v-else class="member-event-grid">
          <article v-for="event in portal.available" :key="event.id" class="member-event-card member-event-card--available">
            <div class="member-event-card__date"><strong>{{ new Date(event.startsAt).getDate() }}</strong><span>{{ new Date(event.startsAt).toLocaleString('pt-BR', { month: 'short' }) }}</span></div>
            <div class="member-event-card__copy">
              <span class="badge badge--open">Inscrições abertas</span>
              <h3>{{ event.title }}</h3>
              <p>{{ event.description }}</p>
              <dl><div><dt>Quando</dt><dd>{{ formatter.format(new Date(event.startsAt)) }}</dd></div><div v-if="event.location"><dt>Onde</dt><dd>{{ event.location }}</dd></div></dl>
            </div>
            <footer>
              <small v-if="availableSpots(event) !== null">{{ availableSpots(event) }} vagas disponíveis</small>
              <small v-else>Sem limite de vagas informado</small>
              <NuxtLink :to="`/e/${event.publicId}`" class="button button--primary">Ver evento e participar</NuxtLink>
            </footer>
          </article>
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading"><div><p class="eyebrow">Seu histórico</p><h2>Eventos registrados</h2><p class="muted">Inscrições confirmadas por você, inclusive encontros anteriores.</p></div></div>
        <div v-if="!portal.registered.length" class="empty-card">
          <span class="empty-icon">◫</span><h3>Você ainda não confirmou participação</h3><p>Escolha um evento disponível para fazer sua primeira inscrição.</p>
        </div>
        <div v-else class="member-registration-list">
          <article v-for="event in portal.registered" :key="event.registrationId" class="member-registration-card">
            <div class="date-tile"><strong>{{ new Date(event.startsAt).getDate() }}</strong><span>{{ new Date(event.startsAt).toLocaleString('pt-BR', { month: 'short' }) }}</span></div>
            <div>
              <span class="badge" :class="`badge--${event.eventStatus}`">{{ statusLabel[event.eventStatus] }}</span>
              <h3>{{ event.title }}</h3>
              <p>{{ formatter.format(new Date(event.startsAt)) }}<template v-if="event.location"> · {{ event.location }}</template></p>
              <div class="member-registration-card__details">
                <span>{{ event.participants.length }} {{ event.participants.length === 1 ? 'participante' : 'participantes' }}</span>
                <span v-if="event.offerings.length">{{ event.offerings.map((offering) => offering.name).join(', ') }}</span>
                <span v-if="event.pixPaymentDeclaredAt">PIX informado</span>
              </div>
            </div>
            <NuxtLink v-if="event.eventStatus === 'published'" :to="`/e/${event.publicId}`" class="button">Revisar inscrição</NuxtLink>
            <span v-else class="member-registration-card__history">No histórico</span>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

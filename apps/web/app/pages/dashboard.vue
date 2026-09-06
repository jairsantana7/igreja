<script setup lang="ts">
useHead({ title: 'Visão geral' });
const api = useApi();
const auth = useAuth();
const { data, pending, error, refresh } = await useAsyncData('dashboard', () => api<any>('/dashboard'), { server: false });
const canCreate = computed(() => auth.session.value?.user.permissions.includes('events.create'));
const canReadAccess = computed(() => auth.session.value?.user.permissions.includes('roles.read'));
interface DashboardRole { id: string; name: string; key: string; permissions: string[] }
interface DashboardAccess { roles: DashboardRole[] }
const { data: access } = await useAsyncData(
  'dashboard-access',
  () => canReadAccess.value ? api<DashboardAccess>('/access') : Promise.resolve(null),
  { server: false },
);
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div><p class="eyebrow">Visão geral</p><h1>Olá, {{ data?.user.name.split(' ')[0] ?? 'bem-vindo' }}</h1><p class="muted">{{ data?.community.name ?? 'Carregando comunidade…' }}</p></div>
      <NuxtLink v-if="canCreate" to="/events/new" class="button button--primary">＋ Criar evento</NuxtLink>
    </header>

    <section class="summary-grid" aria-label="Resumo">
      <article class="summary-card"><span class="summary-icon green">◫</span><p>Eventos abertos</p><strong>{{ data?.events.filter((event: any) => event.registrationOpen).length ?? '—' }}</strong><small>recebendo inscrições</small></article>
      <article class="summary-card"><span class="summary-icon gold">✓</span><p>Inscrições</p><strong>{{ data?.events.reduce((total: number, event: any) => total + event.registrations, 0) ?? '—' }}</strong><small>confirmadas</small></article>
      <article class="summary-card"><span class="summary-icon blue">↗</span><p>Eventos publicados</p><strong>{{ data?.events.filter((event: any) => event.status === 'published').length ?? '—' }}</strong><small>com link ativo</small></article>
    </section>

    <section v-if="canReadAccess" class="section-block dashboard-access">
      <div class="section-heading"><div><h2>Papéis e acessos</h2><p class="muted">Libere ou bloqueie funcionalidades por permissões granulares.</p></div><NuxtLink to="/access" class="section-link">Gerenciar →</NuxtLink></div>
      <div class="dashboard-role-list">
        <article v-for="role in access?.roles.slice(0, 4)" :key="role.id" class="dashboard-role-item">
          <span class="role-symbol">{{ role.name.charAt(0).toUpperCase() }}</span>
          <span><strong>{{ role.name }}</strong><small>{{ role.permissions.length }} permissões liberadas</small></span>
        </article>
        <p v-if="!access?.roles.length" class="muted">Nenhum papel configurado.</p>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading"><div><h2>Seus eventos</h2><p class="muted">Crie, publique e acompanhe inscrições confirmadas.</p></div><NuxtLink to="/events" class="section-link">Ver todos →</NuxtLink></div>
      <div v-if="pending" class="empty-card">Carregando eventos…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else-if="!data?.events.length" class="empty-card"><span class="empty-icon">＋</span><h3>Seu primeiro evento começa aqui</h3><p>Defina os detalhes e monte o formulário de inscrição.</p><NuxtLink v-if="canCreate" to="/events/new" class="button button--primary">Criar evento</NuxtLink></div>
      <div v-else class="event-list">
        <article v-for="event in data.events" :key="event.id" class="event-card">
          <div class="date-tile"><strong>{{ new Date(event.startsAt).getDate() }}</strong><span>{{ new Date(event.startsAt).toLocaleString('pt-BR', { month: 'short' }) }}</span></div>
          <div class="event-card__body"><span class="badge" :class="`badge--${event.status}`">{{ event.status === 'published' ? 'Publicado' : event.status === 'draft' ? 'Rascunho' : event.status === 'registration_closed' ? 'Inscrições encerradas' : event.status === 'completed' ? 'Concluído' : 'Cancelado' }}</span><h3>{{ event.title }}</h3><p>{{ formatter.format(new Date(event.startsAt)) }}<template v-if="event.location"> · {{ event.location }}</template></p></div>
          <div class="event-card__meta"><strong>{{ event.participants }}</strong><small>pessoas · {{ event.registrations }} inscrições · {{ event.attendance }} presenças</small><div class="event-card__actions event-card__actions--compact" aria-label="Ações do evento"><NuxtLink :to="`/events/${event.id}`" class="event-action-button event-action-button--primary"><span aria-hidden="true">◎</span> Gerenciar</NuxtLink><NuxtLink v-if="event.status === 'published'" :to="`/e/${event.publicId}`" target="_blank" rel="noopener noreferrer" class="event-action-button event-action-button--secondary"><span aria-hidden="true">↗</span> Abrir</NuxtLink></div></div>
        </article>
      </div>
    </section>
  </div>
</template>

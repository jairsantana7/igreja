<script setup lang="ts">
useHead({ title: 'Visão geral' });
const api = useApi();
const auth = useAuth();
const { data, pending, error, refresh } = await useAsyncData('dashboard', () => api<any>('/dashboard'));
const canCreate = computed(() => auth.session.value?.user.permissions.includes('events.create'));
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div><p class="eyebrow">Visão geral</p><h1>Olá, {{ data?.user.name.split(' ')[0] ?? 'bem-vindo' }}</h1><p class="muted">{{ data?.community.name ?? 'Carregando comunidade…' }}</p></div>
      <NuxtLink v-if="canCreate" to="/events/new" class="button button--primary">＋ Criar evento</NuxtLink>
    </header>

    <section class="summary-grid" aria-label="Resumo">
      <article class="summary-card"><span class="summary-icon green">◫</span><p>Próximos eventos</p><strong>{{ data?.events.filter((event: any) => new Date(event.startsAt) > new Date()).length ?? '—' }}</strong><small>programados</small></article>
      <article class="summary-card"><span class="summary-icon gold">✓</span><p>Inscrições</p><strong>{{ data?.events.reduce((total: number, event: any) => total + event.registrations, 0) ?? '—' }}</strong><small>confirmadas</small></article>
      <article class="summary-card"><span class="summary-icon blue">↗</span><p>Eventos publicados</p><strong>{{ data?.events.filter((event: any) => event.status === 'published').length ?? '—' }}</strong><small>com link ativo</small></article>
    </section>

    <section class="section-block">
      <div class="section-heading"><div><h2>Seus eventos</h2><p class="muted">Crie, publique e acompanhe inscrições.</p></div></div>
      <div v-if="pending" class="empty-card">Carregando eventos…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else-if="!data?.events.length" class="empty-card"><span class="empty-icon">＋</span><h3>Seu primeiro evento começa aqui</h3><p>Defina os detalhes e monte o formulário de inscrição.</p><NuxtLink v-if="canCreate" to="/events/new" class="button button--primary">Criar evento</NuxtLink></div>
      <div v-else class="event-list">
        <article v-for="event in data.events" :key="event.id" class="event-card">
          <div class="date-tile"><strong>{{ new Date(event.startsAt).getDate() }}</strong><span>{{ new Date(event.startsAt).toLocaleString('pt-BR', { month: 'short' }) }}</span></div>
          <div class="event-card__body"><span class="badge" :class="`badge--${event.status}`">{{ event.status === 'published' ? 'Publicado' : event.status === 'draft' ? 'Rascunho' : 'Cancelado' }}</span><h3>{{ event.title }}</h3><p>{{ formatter.format(new Date(event.startsAt)) }}<template v-if="event.location"> · {{ event.location }}</template></p></div>
          <div class="event-card__meta"><strong>{{ event.registrations }}</strong><small>inscrições</small><NuxtLink v-if="event.status === 'published'" :to="`/e/${event.publicId}`">Abrir link ↗</NuxtLink></div>
        </article>
      </div>
    </section>
  </div>
</template>

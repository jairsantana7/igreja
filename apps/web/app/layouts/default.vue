<script setup lang="ts">
const auth = useAuth();
const api = useApi();
const route = useRoute();
const canReadMembers = computed(() => auth.session.value?.user.permissions.includes('users.read'));
const canReadSettings = computed(() => auth.session.value?.user.permissions.includes('settings.read'));
const canReadAccess = computed(() => auth.session.value?.user.permissions.includes('roles.read'));
const canReadAudit = computed(() => auth.session.value?.user.permissions.includes('audit.read'));

async function leave() {
  try { await api('/sessions/current', { method: 'DELETE' }); } catch { /* O logout local continua se a API estiver indisponível. */ }
  auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <AppLogo light />
      <nav class="sidebar__nav" aria-label="Navegação principal">
        <NuxtLink to="/dashboard" class="nav-link" :class="{ active: route.path === '/dashboard' }">
          <span aria-hidden="true">⌂</span> Visão geral
        </NuxtLink>
        <NuxtLink to="/events" class="nav-link" :class="{ active: route.path === '/events' }">
          <span aria-hidden="true">◫</span> Eventos
        </NuxtLink>
        <NuxtLink to="/events/new" class="nav-link" :class="{ active: route.path === '/events/new' }">
          <span aria-hidden="true">＋</span> Novo evento
        </NuxtLink>
        <NuxtLink v-if="canReadMembers" to="/members" class="nav-link" :class="{ active: route.path === '/members' }">
          <span aria-hidden="true">♙</span> Membros
        </NuxtLink>
        <NuxtLink v-if="canReadAccess" to="/access" class="nav-link" :class="{ active: route.path === '/access' }">
          <span aria-hidden="true">⌘</span> Acessos
        </NuxtLink>
        <NuxtLink v-if="canReadAudit" to="/audit" class="nav-link" :class="{ active: route.path === '/audit' }">
          <span aria-hidden="true">◎</span> Auditoria
        </NuxtLink>
        <NuxtLink v-if="canReadSettings" to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <span aria-hidden="true">⚙</span> Configurações
        </NuxtLink>
      </nav>
      <div class="sidebar__account">
        <span class="avatar">{{ auth.session.value?.user.name.charAt(0).toUpperCase() }}</span>
        <span><strong>{{ auth.session.value?.user.name }}</strong><small>{{ auth.session.value?.user.roles.join(', ') }}</small></span>
        <button type="button" class="icon-button" aria-label="Sair" title="Sair" @click="leave">↗</button>
      </div>
    </aside>
    <main class="main-content"><slot /></main>
  </div>
</template>

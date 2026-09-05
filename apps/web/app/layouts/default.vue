<script setup lang="ts">
const auth = useAuth();
const route = useRoute();

async function leave() {
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
        <NuxtLink to="/events/new" class="nav-link" :class="{ active: route.path === '/events/new' }">
          <span aria-hidden="true">＋</span> Novo evento
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

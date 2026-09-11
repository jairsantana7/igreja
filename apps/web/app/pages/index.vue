<script setup lang="ts">
import { sessionHomePath } from '~/utils/session-home';

const auth = useAuth();
auth.hydrate();
await navigateTo(auth.session.value ? sessionHomePath(auth.session.value.user) : '/login');
</script>

<template>
  <span class="route-loading" aria-hidden="true" />
</template>

<script setup lang="ts">
defineProps<{ light?: boolean; compact?: boolean }>();
const config = useRuntimeConfig();
</script>

<template>
  <span class="logo" :class="{ 'logo--light': light }" :aria-label="String(config.public.appName)">
    <span class="logo__mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M24 5.5c9.4 0 17 7.5 17 16.8 0 11.5-12.2 18.3-17 20.2-4.8-1.9-17-8.7-17-20.2C7 13 14.6 5.5 24 5.5Z" fill="currentColor" opacity=".16" />
        <path d="M24 11v26M13.5 21.5h21" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
        <path d="M24 38.5c4.3-1.8 12.5-7.2 12.5-15.8 0-7-5.6-12.6-12.5-12.6S11.5 15.7 11.5 22.7c0 8.6 8.2 14 12.5 15.8Z" stroke="currentColor" stroke-width="2" />
      </svg>
    </span>
    <span v-if="!compact" class="logo__text">
      <strong>{{ config.public.appName }}</strong>
      <small>Eventos que aproximam pessoas</small>
    </span>
  </span>
</template>

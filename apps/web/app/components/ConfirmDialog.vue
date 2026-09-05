<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
}>();

defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="$emit('cancel')">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <button class="icon-close confirm-dialog__close" type="button" aria-label="Fechar" :disabled="busy" @click="$emit('cancel')">×</button>
        <span class="confirm-dialog__symbol" aria-hidden="true">!</span>
        <p class="eyebrow">Ação importante</p>
        <h2 id="confirm-dialog-title">{{ title }}</h2>
        <p>{{ description }}</p>
        <footer><button class="button" type="button" :disabled="busy" @click="$emit('cancel')">Voltar</button><button class="button button--danger-solid" type="button" :disabled="busy" @click="$emit('confirm')">{{ busy ? 'Cancelando…' : confirmLabel ?? 'Confirmar' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

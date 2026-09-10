<script setup lang="ts">
const color = defineModel<string>({ required: true });

const options = [
  { value: '#173D32', label: 'Verde' },
  { value: '#1F3A5F', label: 'Azul' },
  { value: '#5A2E46', label: 'Ameixa' },
  { value: '#6A3E24', label: 'Terracota' },
  { value: '#2E2A47', label: 'Violeta' },
  { value: '#3C4043', label: 'Grafite' },
];

const normalizedColor = computed(() => /^#[0-9A-F]{6}$/i.test(color.value) ? color.value.toUpperCase() : '#173D32');
const previewRgb = computed(() => {
  const value = normalizedColor.value.slice(1);
  return [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)]
    .map((channel) => Math.round(Number.parseInt(channel, 16) * 0.35))
    .join(', ');
});
</script>

<template>
  <div class="hero-theme-picker">
    <div class="hero-theme-picker__heading">
      <div><strong>Tom da página do evento</strong><small>Personalize a sobreposição do hero sem comprometer a leitura.</small></div>
      <label class="hero-theme-picker__custom">
        <span>Cor personalizada</span>
        <input v-model="color" type="color" aria-label="Escolher uma cor personalizada para o hero">
        <output>{{ normalizedColor }}</output>
      </label>
    </div>
    <div class="hero-theme-picker__layout">
      <div class="hero-theme-picker__options" aria-label="Cores sugeridas">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          :class="{ active: normalizedColor === option.value }"
          :aria-pressed="normalizedColor === option.value"
          @click="color = option.value"
        >
          <span :style="{ backgroundColor: option.value }" />
          <small>{{ option.label }}</small>
        </button>
      </div>
      <div class="hero-theme-picker__preview" :style="{ '--hero-theme-rgb': previewRgb }">
        <span>Prévia da página pública</span>
        <strong>Seu evento</strong>
        <small>Informações claras sobre a imagem</small>
      </div>
    </div>
  </div>
</template>

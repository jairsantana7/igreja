<script setup lang="ts">
definePageMeta({ layout: 'login' });
const route = useRoute();
const config = useRuntimeConfig();
const api = useApi();
const auth = useAuth();
const publicId = String(route.params.publicId);
const { data: event, error } = await useAsyncData(`public-event-${publicId}`, () =>
  $fetch<any>(`/public/events/${publicId}`, { baseURL: String(config.public.apiBaseUrl) }),
);
useHead({ title: computed(() => event.value?.title ?? 'Evento') });

const mode = ref<'signup' | 'login'>('signup');
const name = ref('');
const email = ref('');
const password = ref('');
const answers = reactive<Record<string, any>>({});
const loading = ref(false);
const message = ref('');
const confirmed = ref(false);

function payloadAnswers() {
  return (event.value?.fields ?? []).map((field: any) => ({ fieldId: field.id, value: answers[field.id] }));
}

async function confirmWithCurrentSession() {
  await api(`/public/events/${publicId}/registrations`, { method: 'POST', body: { answers: payloadAnswers() } });
  confirmed.value = true;
}

async function submit() {
  loading.value = true; message.value = '';
  try {
    if (auth.session.value) {
      await confirmWithCurrentSession();
    } else if (mode.value === 'signup') {
      const response = await api<{ accessToken: string; user: any }>(`/public/events/${publicId}/signup`, {
        method: 'POST', body: { name: name.value, email: email.value, password: password.value, answers: payloadAnswers() },
      });
      auth.setSession(response);
      confirmed.value = true;
    } else {
      const response = await api<{ accessToken: string; user: any }>(`/public/events/${publicId}/login`, {
        method: 'POST', body: { email: email.value, password: password.value },
      });
      auth.setSession(response);
      await confirmWithCurrentSession();
    }
  } catch (requestError: any) {
    message.value = Array.isArray(requestError?.data?.message) ? requestError.data.message.join(' ') : requestError?.data?.message ?? 'Não foi possível confirmar sua inscrição.';
  } finally { loading.value = false; }
}

const dateLabel = computed(() => event.value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(event.value.startsAt)) : '');
const mediaUrl = (mediaId: string) => `${String(config.public.apiBaseUrl).replace(/\/$/, '')}/public/events/${publicId}/media/${mediaId}`;
</script>

<template>
  <main class="public-page">
    <div v-if="event?.images.length && event.mediaDisplayMode === 'fixed'" class="public-fixed-media" aria-hidden="true"><img :src="mediaUrl(event.images[0].id)" alt=""><span /></div>
    <header class="public-header"><AppLogo /><span v-if="event">{{ event.communityName }}</span></header>
    <div v-if="error" class="public-error"><h1>Evento não encontrado</h1><p>O link pode estar incorreto ou o evento ainda não foi publicado.</p></div>
    <div v-else-if="!event" class="public-error">Carregando evento…</div>
    <template v-else>
      <section v-if="event.images.length && event.mediaDisplayMode === 'hero'" class="public-event-hero"><img :src="mediaUrl(event.images[0].id)" :alt="event.images[0].altText || event.title"></section>
      <section v-if="event.images.length && event.mediaDisplayMode === 'carousel'" class="public-event-carousel" aria-label="Imagens do evento"><figure v-for="image in event.images" :key="image.id"><img :src="mediaUrl(image.id)" :alt="image.altText || event.title"></figure></section>
      <div class="public-grid" :class="{ 'public-grid--fixed': event.images.length && event.mediaDisplayMode === 'fixed' }">
      <section class="event-intro"><p class="eyebrow">Convite para você</p><h1>{{ event.title }}</h1><p class="event-description">{{ event.description }}</p><dl><div><dt>Data e hora</dt><dd>{{ dateLabel }}</dd></div><div v-if="event.location"><dt>Local</dt><dd>{{ event.location }}</dd></div><div v-if="event.capacity"><dt>Vagas</dt><dd>{{ event.capacity }} participantes</dd></div></dl></section>

      <section class="registration-card">
        <div v-if="confirmed" class="success-state"><span>✓</span><p class="eyebrow">Inscrição confirmada</p><h2>Esperamos por você!</h2><p>Sua participação em <strong>{{ event.title }}</strong> foi registrada.</p></div>
        <form v-else @submit.prevent="submit">
          <p class="eyebrow">Confirme sua presença</p><h2>{{ auth.session.value ? `Olá, ${auth.session.value.user.name.split(' ')[0]}` : 'Faça sua inscrição' }}</h2><p class="muted">{{ auth.session.value ? 'Responda o formulário para concluir.' : 'Crie uma conta ou entre se você já participou de outro evento.' }}</p>
          <div v-if="!auth.session.value" class="tabs"><button type="button" :class="{ active: mode === 'signup' }" @click="mode = 'signup'">Primeiro acesso</button><button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">Já tenho conta</button></div>
          <label v-if="!auth.session.value && mode === 'signup'" class="field"><span>Nome completo</span><input v-model="name" autocomplete="name" required></label>
          <label v-if="!auth.session.value" class="field"><span>E-mail</span><input v-model="email" type="email" autocomplete="username" required></label>
          <label v-if="!auth.session.value" class="field"><span>Senha</span><input v-model="password" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" minlength="8" required></label>
          <div v-if="event.fields.length" class="dynamic-fields"><h3>Sobre sua participação</h3><template v-for="field in event.fields" :key="field.id"><label v-if="field.type === 'short_text'" class="field"><span>{{ field.label }}<b v-if="field.required"> *</b></span><input v-model="answers[field.id]" :required="field.required"></label><label v-else-if="field.type === 'long_text'" class="field"><span>{{ field.label }}<b v-if="field.required"> *</b></span><textarea v-model="answers[field.id]" rows="4" :required="field.required"></textarea></label><label v-else-if="field.type === 'single_choice'" class="field"><span>{{ field.label }}<b v-if="field.required"> *</b></span><select v-model="answers[field.id]" :required="field.required"><option value="" disabled>Selecione</option><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select></label><label v-else class="check check--card"><input v-model="answers[field.id]" type="checkbox" :required="field.required"> {{ field.label }}</label></template></div>
          <p v-if="message" class="alert" role="alert">{{ message }}</p><button class="button button--primary button--large" type="submit" :disabled="loading">{{ loading ? 'Confirmando…' : 'Confirmar inscrição' }}</button><p class="privacy-note">Ao continuar, seus dados serão compartilhados somente com esta comunidade para organizar o evento.</p>
        </form>
      </section>
      </div>
    </template>
  </main>
</template>

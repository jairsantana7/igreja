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
const profile = reactive({
  phone: '',
  birthDate: '',
  spouseName: '',
  marriageDate: '',
  children: [] as Array<{ name: string; birthDate: string }>,
});
const selectedParticipantKeys = ref<string[]>(['registrant']);
const selectedOfferingIds = ref<string[]>([]);
const loading = ref(false);
const contextLoading = ref(false);
const message = ref('');
const confirmed = ref(false);
const alreadyRegistered = ref(false);

function payloadAnswers() {
  return (event.value?.fields ?? []).map((field: any) => ({ fieldId: field.id, value: answers[field.id] }));
}

function registrationPayload() {
  const children = profile.children.filter((child) => child.name.trim());
  const childIndexes = new Map<number, number>();
  let compactIndex = 0;
  profile.children.forEach((child, index) => {
    if (child.name.trim()) childIndexes.set(index, compactIndex++);
  });
  const participantKeys = selectedParticipantKeys.value.flatMap((key) => {
    if (!key.startsWith('child:')) return [key];
    const mapped = childIndexes.get(Number(key.slice(6)));
    return mapped === undefined ? [] : [`child:${mapped}`];
  });
  return {
    answers: payloadAnswers(),
    participantKeys,
    offeringIds: selectedOfferingIds.value,
    ...(event.value?.familyRegistrationEnabled ? {
      profile: {
        phone: profile.phone || undefined,
        birthDate: profile.birthDate || undefined,
        spouseName: profile.spouseName || undefined,
        marriageDate: profile.marriageDate || undefined,
        children: children.map((child) => ({ name: child.name, birthDate: child.birthDate || undefined })),
      },
    } : {}),
  };
}

async function loadRegistrationContext() {
  if (!auth.session.value) return;
  contextLoading.value = true;
  try {
    const context = await api<any>(`/public/events/${publicId}/registration-context`);
    profile.phone = context.profile.phone ?? '';
    profile.birthDate = context.profile.birthDate ?? '';
    profile.spouseName = context.profile.spouseName ?? '';
    profile.marriageDate = context.profile.marriageDate ?? '';
    profile.children = context.profile.children.map((child: any) => ({
      name: child.name,
      birthDate: child.birthDate ?? '',
    }));
    selectedParticipantKeys.value = context.selectedParticipantKeys.length
      ? context.selectedParticipantKeys
      : ['registrant'];
    selectedOfferingIds.value = context.selectedOfferingIds;
    alreadyRegistered.value = context.alreadyRegistered;
  } catch (requestError: any) {
    message.value = requestError?.data?.message ?? 'Não foi possível carregar seus dados anteriores.';
  } finally {
    contextLoading.value = false;
  }
}

onMounted(loadRegistrationContext);

function addChild() {
  profile.children.push({ name: '', birthDate: '' });
}

function removeChild(index: number) {
  const previousSelection = [...selectedParticipantKeys.value];
  profile.children.splice(index, 1);
  selectedParticipantKeys.value = selectedParticipantKeys.value
    .filter((key) => !key.startsWith('child:'))
    .concat(previousSelection.flatMap((key) => {
      if (!key.startsWith('child:')) return [];
      const previousIndex = Number(key.slice(6));
      if (previousIndex === index) return [];
      return [`child:${previousIndex > index ? previousIndex - 1 : previousIndex}`];
    }));
}

async function confirmWithCurrentSession() {
  await api(`/public/events/${publicId}/registrations`, { method: 'POST', body: registrationPayload() });
  confirmed.value = true;
}

async function submit() {
  loading.value = true;
  message.value = '';
  try {
    if (auth.session.value) {
      await confirmWithCurrentSession();
    } else if (mode.value === 'signup') {
      const response = await api<{ sessionProof: string; user: any }>(`/public/events/${publicId}/signup`, {
        method: 'POST',
        body: { name: name.value, email: email.value, password: password.value, ...registrationPayload() },
      });
      auth.setSession(response);
      confirmed.value = true;
    } else {
      const response = await api<{ sessionProof: string; user: any }>(`/public/events/${publicId}/login`, {
        method: 'POST', body: { email: email.value, password: password.value },
      });
      auth.setSession(response);
      await loadRegistrationContext();
      message.value = 'Dados carregados. Revise quem vai participar e confirme sua inscrição.';
    }
  } catch (requestError: any) {
    message.value = Array.isArray(requestError?.data?.message)
      ? requestError.data.message.join(' ')
      : requestError?.data?.message ?? 'Não foi possível confirmar sua inscrição.';
  } finally {
    loading.value = false;
  }
}

const dateLabel = computed(() => event.value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(event.value.startsAt))
  : '');
const mediaUrl = (mediaId: string) => `${String(config.public.apiBaseUrl).replace(/\/$/, '')}/public/events/${publicId}/media/${mediaId}`;
const coverImage = computed(() => event.value?.images?.[0] ? mediaUrl(event.value.images[0].id) : '');
const priceLabel = (priceCents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceCents / 100);
const selectedPeopleCount = computed(() => selectedParticipantKeys.value.length);
const selectedPaidOffering = computed(() => (event.value?.offerings ?? [])
  .some((offering: any) => selectedOfferingIds.value.includes(offering.id) && offering.priceCents > 0));
</script>

<template>
  <main class="public-event-page">
    <div v-if="error" class="public-error"><h1>Evento não encontrado</h1><p>O link pode estar incorreto ou o evento ainda não foi publicado.</p></div>
    <div v-else-if="!event" class="public-error">Carregando evento…</div>
    <template v-else>
      <section class="event-fold" :class="`event-fold--${event.mediaDisplayMode}`">
        <div class="event-fold__background" :class="{ 'event-fold__background--empty': !coverImage }">
          <img v-if="coverImage" :src="coverImage" :alt="event.images[0].altText || event.title">
        </div>
        <div class="event-fold__shade" />
        <header class="event-fold__header">
          <AppLogo light />
          <span>{{ event.communityName }}</span>
        </header>

        <div class="event-fold__layout">
          <section class="event-fold__intro">
            <p class="event-fold__eyebrow">Um convite para você</p>
            <h1>{{ event.title }}</h1>
            <p v-if="event.description" class="event-fold__description">{{ event.description }}</p>
            <dl class="event-fold__facts">
              <div><dt>Quando</dt><dd>{{ dateLabel }}</dd></div>
              <div v-if="event.location"><dt>Onde</dt><dd>{{ event.location }}</dd></div>
              <div v-if="event.capacity"><dt>Capacidade</dt><dd>{{ event.capacity }} participantes</dd></div>
            </dl>
          </section>

          <section class="registration-card registration-card--overlay">
            <div v-if="confirmed" class="success-state">
              <span>✓</span><p class="eyebrow">Inscrição confirmada</p><h2>Esperamos por você!</h2>
              <p>Sua participação em <strong>{{ event.title }}</strong> foi registrada para {{ selectedPeopleCount }} {{ selectedPeopleCount === 1 ? 'pessoa' : 'pessoas' }}.</p>
              <div v-if="selectedPaidOffering && event.pix" class="pix-confirmation">
                <strong>Pagamento do adicional por Pix</strong>
                <span>{{ event.pix.key }}</span>
                <small>{{ event.pix.recipientName }}</small>
              </div>
            </div>

            <form v-else @submit.prevent="submit">
              <div class="registration-card__heading">
                <div><p class="eyebrow">Confirme sua presença</p><h2>{{ auth.session.value ? `Olá, ${auth.session.value.user.name.split(' ')[0]}` : 'Faça sua inscrição' }}</h2></div>
                <span v-if="alreadyRegistered" class="status-badge status-badge--published">Já inscrito</span>
              </div>
              <p class="muted">{{ auth.session.value ? 'Revise os dados e escolha quem vai participar.' : 'Crie uma conta ou entre se você já participou antes.' }}</p>

              <div v-if="!auth.session.value" class="tabs">
                <button type="button" :class="{ active: mode === 'signup' }" @click="mode = 'signup'">Primeiro acesso</button>
                <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">Já tenho conta</button>
              </div>
              <label v-if="!auth.session.value && mode === 'signup'" class="field"><span>Nome completo</span><input v-model="name" autocomplete="name" required></label>
              <label v-if="!auth.session.value" class="field"><span>E-mail</span><input v-model="email" type="email" autocomplete="username" required></label>
              <label v-if="!auth.session.value" class="field"><span>Senha</span><input v-model="password" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" minlength="8" required></label>

              <div v-if="event.familyRegistrationEnabled && (auth.session.value || mode === 'signup')" class="registration-section">
                <div class="registration-section__heading"><div><h3>Quem vai participar?</h3><p>Uma pessoa confirma a participação da família.</p></div><strong>{{ selectedPeopleCount }}</strong></div>
                <label class="participant-option">
                  <input v-model="selectedParticipantKeys" type="checkbox" value="registrant">
                  <span><strong>{{ auth.session.value?.user.name || name || 'Você' }}</strong><small>Responsável pela inscrição</small></span>
                </label>
                <div class="profile-fields">
                  <label class="field"><span>WhatsApp</span><input v-model="profile.phone" autocomplete="tel" placeholder="(00) 00000-0000"></label>
                  <label class="field"><span>Sua data de nascimento</span><input v-model="profile.birthDate" type="date"></label>
                </div>
                <div class="family-person">
                  <label class="participant-option participant-option--editable">
                    <input v-model="selectedParticipantKeys" type="checkbox" value="spouse" :disabled="!profile.spouseName.trim()">
                    <span><strong>Cônjuge</strong><small>Marque se também vai ao evento</small></span>
                  </label>
                  <div class="profile-fields">
                    <label class="field"><span>Nome do cônjuge</span><input v-model="profile.spouseName" placeholder="Nome completo"></label>
                    <label class="field"><span>Data de casamento</span><input v-model="profile.marriageDate" type="date"></label>
                  </div>
                </div>
                <div v-for="(child, index) in profile.children" :key="index" class="family-person">
                  <label class="participant-option participant-option--editable">
                    <input v-model="selectedParticipantKeys" type="checkbox" :value="`child:${index}`" :disabled="!child.name.trim()">
                    <span><strong>Filho(a) {{ index + 1 }}</strong><small>Marque se também vai ao evento</small></span>
                    <button type="button" aria-label="Remover filho" @click.prevent="removeChild(index)">×</button>
                  </label>
                  <div class="profile-fields">
                    <label class="field"><span>Nome</span><input v-model="child.name" placeholder="Nome completo"></label>
                    <label class="field"><span>Nascimento</span><input v-model="child.birthDate" type="date"></label>
                  </div>
                </div>
                <button type="button" class="text-action" @click="addChild">＋ Adicionar filho(a)</button>
              </div>

              <div v-if="event.offerings.length && (auth.session.value || mode === 'signup')" class="registration-section">
                <div class="registration-section__heading"><div><h3>Opções do evento</h3><p>Escolhas opcionais para esta participação.</p></div></div>
                <label v-for="offering in event.offerings" :key="offering.id" class="offering-option">
                  <input v-model="selectedOfferingIds" type="checkbox" :value="offering.id">
                  <span><strong>{{ offering.name }}</strong><small v-if="offering.description">{{ offering.description }}</small></span>
                  <b>{{ offering.priceCents ? priceLabel(offering.priceCents) : 'Grátis' }}</b>
                </label>
              </div>

              <div v-if="event.fields.length && (auth.session.value || mode === 'signup')" class="dynamic-fields">
                <h3>Sobre sua participação</h3>
                <template v-for="field in event.fields" :key="field.id">
                  <label v-if="field.type === 'short_text'" class="field"><span>{{ field.label }}<b v-if="field.required"> *</b></span><input v-model="answers[field.id]" :required="field.required"></label>
                  <label v-else-if="field.type === 'long_text'" class="field"><span>{{ field.label }}<b v-if="field.required"> *</b></span><textarea v-model="answers[field.id]" rows="4" :required="field.required"></textarea></label>
                  <label v-else-if="field.type === 'single_choice'" class="field"><span>{{ field.label }}<b v-if="field.required"> *</b></span><select v-model="answers[field.id]" :required="field.required"><option value="" disabled>Selecione</option><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select></label>
                  <label v-else class="check check--card"><input v-model="answers[field.id]" type="checkbox" :required="field.required"> {{ field.label }}</label>
                </template>
              </div>
              <p v-if="contextLoading" class="muted">Carregando seus dados…</p>
              <p v-if="message" class="alert" role="status">{{ message }}</p>
              <button class="button button--primary button--large" type="submit" :disabled="loading || contextLoading">
                {{ loading ? 'Aguarde…' : !auth.session.value && mode === 'login' ? 'Entrar e continuar' : alreadyRegistered ? 'Atualizar inscrição' : 'Confirmar inscrição' }}
              </button>
              <p class="privacy-note">Seus dados são usados somente por esta comunidade para organizar o evento.</p>
            </form>
          </section>
        </div>
      </section>

      <section v-if="event.images.length > 1 && event.mediaDisplayMode === 'carousel'" class="event-gallery" aria-label="Outras imagens do evento">
        <figure v-for="image in event.images.slice(1)" :key="image.id"><img :src="mediaUrl(image.id)" :alt="image.altText || event.title"></figure>
      </section>
    </template>
  </main>
</template>

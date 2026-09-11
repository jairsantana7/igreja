<script setup lang="ts">
definePageMeta({ layout: 'login' });
const route = useRoute();
const config = useRuntimeConfig();
const api = useApi();
const auth = useAuth();
const publicId = String(route.params.publicId);
const hydrated = ref(false);
const visibleSession = computed(() => hydrated.value ? auth.session.value : null);
const { data: event, error } = await useAsyncData(`public-event-${publicId}`, () =>
  $fetch<any>(`/public/events/${publicId}`, { baseURL: String(config.public.apiBaseUrl) }),
);
useHead({ title: computed(() => event.value?.title ?? 'Evento') });

const mode = ref<'signup' | 'login'>('login');
const name = ref('');
const email = ref('');
const loginIdentifier = ref('');
const password = ref('');
const answers = reactive<Record<string, any>>({});
const profile = reactive({
  phone: '',
  whatsappCommunicationOptIn: false,
  birthDate: '',
  spouseName: '',
  marriageDate: '',
  children: [] as Array<{ name: string; birthDate: string }>,
});
const selectedParticipantKeys = ref<string[]>(['registrant']);
const selectedOfferingIds = ref<string[]>([]);
const pixPaymentDeclared = ref(false);
const hasSavedProfile = ref(false);
const phoneLoginEnabled = ref(false);
const profileEditorOpen = ref(true);
const hydratingSelection = ref(false);
const loading = ref(false);
const contextLoading = ref(false);
const message = ref('');
const confirmed = ref(false);
const alreadyRegistered = ref(false);
const reviewingRegistration = ref(false);

function payloadAnswers() {
  return (event.value?.fields ?? []).flatMap((field: any) => {
    const value = answers[field.id];
    return value === undefined ? [] : [{ fieldId: field.id, value }];
  });
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
    pixPaymentDeclared: pixPaymentDeclared.value,
    profile: {
      phone: profile.phone || undefined,
      whatsappCommunicationOptIn: profile.whatsappCommunicationOptIn,
      ...(event.value?.familyRegistrationEnabled ? {
        birthDate: profile.birthDate || undefined,
        spouseName: profile.spouseName || undefined,
        marriageDate: profile.marriageDate || undefined,
        children: children.map((child) => ({ name: child.name, birthDate: child.birthDate || undefined })),
      } : { children: [] }),
    },
  };
}

async function loadRegistrationContext() {
  if (!auth.session.value) return;
  contextLoading.value = true;
  try {
    const context = await api<any>(`/public/events/${publicId}/registration-context`);
    profile.phone = context.profile.phone ?? '';
    profile.whatsappCommunicationOptIn = context.profile.whatsappCommunicationOptIn ?? false;
    profile.birthDate = context.profile.birthDate ?? '';
    profile.spouseName = context.profile.spouseName ?? '';
    profile.marriageDate = context.profile.marriageDate ?? '';
    profile.children = context.profile.children.map((child: any) => ({
      name: child.name,
      birthDate: child.birthDate ?? '',
    }));
    hydratingSelection.value = true;
    selectedParticipantKeys.value = context.selectedParticipantKeys.length
      ? context.selectedParticipantKeys
      : ['registrant'];
    selectedOfferingIds.value = context.selectedOfferingIds;
    for (const key of Object.keys(answers)) delete answers[key];
    for (const answer of context.answers ?? []) answers[answer.fieldId] = answer.value;
    pixPaymentDeclared.value = context.pixPaymentDeclared;
    hasSavedProfile.value = context.hasSavedProfile;
    phoneLoginEnabled.value = context.phoneLoginEnabled;
    profileEditorOpen.value = !context.hasSavedProfile;
    alreadyRegistered.value = context.alreadyRegistered;
    reviewingRegistration.value = false;
    await nextTick();
    hydratingSelection.value = false;
  } catch (requestError: any) {
    message.value = requestError?.data?.message ?? 'Não foi possível carregar seus dados anteriores.';
  } finally {
    contextLoading.value = false;
  }
}

onMounted(() => {
  hydrated.value = true;
  void loadRegistrationContext();
});
watch(() => profile.phone, (phone) => {
  if (!phone.trim()) profile.whatsappCommunicationOptIn = false;
});
watch(selectedOfferingIds, () => {
  if (!hydratingSelection.value) pixPaymentDeclared.value = false;
}, { deep: true });

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
        method: 'POST', body: { identifier: loginIdentifier.value, password: password.value },
      });
      auth.setSession(response);
      await loadRegistrationContext();
      if (!alreadyRegistered.value) {
        message.value = 'Dados carregados. Revise quem vai participar e confirme sua inscrição.';
      }
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
const linkedGalleryCover = computed(() => {
  const gallery = event.value?.linkedGallery;
  return gallery?.coverPhotoId
    ? `${String(config.public.apiBaseUrl).replace(/\/$/, '')}/public/galleries/${gallery.publicId}/photos/${gallery.coverPhotoId}/display`
    : '';
});
const linkedGalleryDate = computed(() => event.value?.linkedGallery
  ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(event.value.linkedGallery.event.startsAt))
  : '');
const heroShadeRgb = computed(() => {
  const color = /^#[0-9A-F]{6}$/i.test(event.value?.heroShadeColor ?? '') ? event.value.heroShadeColor : '#173D32';
  return [1, 3, 5]
    .map((start) => Math.round(Number.parseInt(color.slice(start, start + 2), 16) * 0.35))
    .join(', ');
});
const mapsEmbedUrl = computed(() => event.value?.location
  ? `https://www.google.com/maps?q=${encodeURIComponent(event.value.location)}&output=embed`
  : '');
const mapsDirectionsUrl = computed(() => event.value?.location
  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.value.location)}`
  : '');
const priceLabel = (priceCents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceCents / 100);
const selectedPeopleCount = computed(() => selectedParticipantKeys.value.length);
const registeredParticipantNames = computed(() => selectedParticipantKeys.value.flatMap((key) => {
  if (key === 'registrant') return [visibleSession.value?.user.name || name.value || 'Você'];
  if (key === 'spouse') return profile.spouseName ? [profile.spouseName] : [];
  if (key.startsWith('child:')) {
    const child = profile.children[Number(key.slice(6))];
    return child?.name ? [child.name] : [];
  }
  return [];
}));
const registeredOfferings = computed(() => (event.value?.offerings ?? [])
  .filter((offering: any) => selectedOfferingIds.value.includes(offering.id)));
const registeredAnswers = computed(() => (event.value?.fields ?? []).flatMap((field: any) => (
  Object.prototype.hasOwnProperty.call(answers, field.id)
    ? [{ id: field.id, label: field.label, value: answers[field.id] }]
    : []
)));
function registrationAnswerLabel(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value === null || value === undefined || value === '') return 'Não informado';
  return String(value);
}
const selectedPaidAmountCents = computed(() => (event.value?.offerings ?? [])
  .filter((offering: any) => selectedOfferingIds.value.includes(offering.id))
  .reduce((total: number, offering: any) => total + Math.max(0, Number(offering.priceCents)), 0));
</script>

<template>
  <main class="public-event-page">
    <div v-if="error" class="public-error"><h1>Evento não encontrado</h1><p>O link pode estar incorreto ou o evento ainda não foi publicado.</p></div>
    <div v-else-if="!event" class="public-error">Carregando evento…</div>
    <template v-else>
      <section class="event-fold" :class="`event-fold--${event.mediaDisplayMode}`" :style="{ '--event-shade-rgb': heroShadeRgb }">
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
            <div v-if="confirmed || alreadyRegistered" class="success-state" :class="{ 'success-state--reviewing': reviewingRegistration }">
              <span>✓</span>
              <p class="eyebrow">{{ confirmed ? 'Inscrição confirmada' : 'Presença garantida' }}</p>
              <h2>{{ confirmed ? 'Esperamos por você!' : 'Você já está inscrito' }}</h2>
              <p>Sua participação em <strong>{{ event.title }}</strong> está confirmada para {{ selectedPeopleCount }} {{ selectedPeopleCount === 1 ? 'pessoa' : 'pessoas' }}. Não é necessário preencher o formulário novamente.</p>
              <button class="button button--primary registration-review-toggle" type="button" :aria-expanded="reviewingRegistration" @click="reviewingRegistration = !reviewingRegistration">
                {{ reviewingRegistration ? 'Ocultar detalhes' : 'Revisar minha inscrição' }}
              </button>

              <div v-if="reviewingRegistration" class="registration-review">
                <section>
                  <span>Participantes confirmados</span>
                  <ul><li v-for="participant in registeredParticipantNames" :key="participant">{{ participant }}</li></ul>
                </section>
                <section>
                  <span>Opções do evento</span>
                  <ul v-if="registeredOfferings.length"><li v-for="offering in registeredOfferings" :key="offering.id"><strong>{{ offering.name }}</strong><small>{{ offering.priceCents ? priceLabel(offering.priceCents) : 'Grátis' }}</small></li></ul>
                  <p v-else>Nenhuma opção adicional selecionada.</p>
                </section>
                <section v-if="registeredAnswers.length">
                  <span>Respostas do formulário</span>
                  <dl><div v-for="answer in registeredAnswers" :key="answer.id"><dt>{{ answer.label }}</dt><dd>{{ registrationAnswerLabel(answer.value) }}</dd></div></dl>
                </section>
                <div v-if="selectedPaidAmountCents > 0 && event.pix && pixPaymentDeclared" class="pix-confirmation">
                  <strong>✓ PIX informado por você</strong>
                  <span>{{ priceLabel(selectedPaidAmountCents) }}</span>
                  <small>A equipe ainda poderá conferir o recebimento no banco.</small>
                </div>
              </div>
            </div>

            <form v-else @submit.prevent="submit">
              <div class="registration-card__heading">
                <div><p class="eyebrow">Confirme sua presença</p><h2>{{ visibleSession ? `Olá, ${visibleSession.user.name.split(' ')[0]}` : 'Faça sua inscrição' }}</h2></div>
              </div>
              <p class="muted">{{ visibleSession ? 'Revise os dados e escolha quem vai participar.' : 'Crie uma conta ou entre se você já participou antes.' }}</p>

              <div v-if="!visibleSession" class="tabs">
                <button type="button" :class="{ active: mode === 'signup' }" @click="mode = 'signup'">Primeiro acesso</button>
                <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">Já tenho conta</button>
              </div>
              <label v-if="!visibleSession && mode === 'signup'" class="field"><span>Nome completo</span><input v-model="name" autocomplete="name" required></label>
              <label v-if="!visibleSession && mode === 'signup'" class="field"><span>E-mail</span><input v-model="email" type="email" autocomplete="email" placeholder="nome@exemplo.com" required></label>
              <label v-if="!visibleSession && mode === 'login'" class="field"><span>E-mail ou WhatsApp</span><input v-model="loginIdentifier" autocomplete="username" placeholder="nome@exemplo.com ou (00) 00000-0000" required></label>
              <label v-if="!visibleSession" class="field"><span>Senha</span><input v-model="password" type="password" :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'" minlength="8" required></label>

              <div v-if="visibleSession && hasSavedProfile && !profileEditorOpen" class="saved-profile-summary">
                <div><p class="eyebrow">Dados já cadastrados</p><h3>Seu perfil está pronto</h3><p><span v-if="profile.phone">WhatsApp {{ profile.phone }}</span><span v-if="phoneLoginEnabled"> · acesso por telefone ativo</span><span v-if="profile.spouseName"> · família de {{ profile.children.length + 2 }} pessoas</span></p></div>
                <button class="button button--small" type="button" @click="profileEditorOpen = true">Revisar/editar meus dados</button>
              </div>

              <div v-if="(visibleSession || mode === 'signup') && (!visibleSession || profileEditorOpen)" class="registration-section">
                <div class="registration-section__heading"><div><h3>Seu WhatsApp</h3><p>Use o mesmo contato nos próximos eventos.</p></div><button v-if="visibleSession && hasSavedProfile" class="text-action text-action--inline" type="button" @click="profileEditorOpen = false">Concluir revisão</button></div>
                <label class="field"><span>Número com DDD</span><input v-model="profile.phone" autocomplete="tel" inputmode="tel" maxlength="32" placeholder="(00) 00000-0000"></label>
                <label class="communication-consent" :class="{ 'communication-consent--disabled': !profile.phone.trim() }">
                  <input v-model="profile.whatsappCommunicationOptIn" type="checkbox" :disabled="!profile.phone.trim()">
                  <span><strong>Autorizo conversas individuais pelo WhatsApp</strong><small>A comunidade poderá iniciar uma conversa neste número. Você pode desativar esta autorização ao atualizar sua inscrição.</small></span>
                </label>
              </div>

              <div v-if="event.familyRegistrationEnabled && (visibleSession || mode === 'signup')" class="registration-section">
                <div class="registration-section__heading"><div><h3>Quem vai participar?</h3><p>Uma pessoa confirma a participação da família.</p></div><strong>{{ selectedPeopleCount }}</strong></div>
                <label class="participant-option">
                  <input v-model="selectedParticipantKeys" type="checkbox" value="registrant">
                  <span><strong>{{ visibleSession?.user.name || name || 'Você' }}</strong><small>Responsável pela inscrição</small></span>
                </label>
                <label v-if="profile.spouseName.trim()" class="participant-option">
                  <input v-model="selectedParticipantKeys" type="checkbox" value="spouse">
                  <span><strong>{{ profile.spouseName }}</strong><small>Cônjuge</small></span>
                </label>
                <label v-for="(child, index) in profile.children" v-show="child.name.trim()" :key="`participant-${index}`" class="participant-option">
                  <input v-model="selectedParticipantKeys" type="checkbox" :value="`child:${index}`">
                  <span><strong>{{ child.name || `Filho(a) ${index + 1}` }}</strong><small>Filho(a)</small></span>
                </label>
                <button v-if="!profileEditorOpen" type="button" class="text-action" @click="profileEditorOpen = true">＋ Atualizar pessoas cadastradas</button>
              </div>

              <div v-if="event.familyRegistrationEnabled && (visibleSession || mode === 'signup') && (!visibleSession || profileEditorOpen)" class="registration-section family-profile-editor">
                <div class="registration-section__heading"><div><h3>Dados da família</h3><p>Preencha uma vez e reaproveite nos próximos eventos.</p></div></div>
                <div class="profile-fields"><label class="field"><span>Sua data de nascimento</span><input v-model="profile.birthDate" type="date"></label></div>
                <div class="family-person">
                  <div class="profile-fields">
                    <label class="field"><span>Nome do cônjuge</span><input v-model="profile.spouseName" placeholder="Nome completo"></label>
                    <label class="field"><span>Data de casamento</span><input v-model="profile.marriageDate" type="date"></label>
                  </div>
                </div>
                <div v-for="(child, index) in profile.children" :key="index" class="family-person">
                  <button type="button" class="family-person__remove" :aria-label="`Remover filho(a) ${index + 1}`" @click="removeChild(index)">×</button>
                  <div class="profile-fields">
                    <label class="field"><span>Nome</span><input v-model="child.name" placeholder="Nome completo"></label>
                    <label class="field"><span>Nascimento</span><input v-model="child.birthDate" type="date"></label>
                  </div>
                </div>
                <button type="button" class="text-action" @click="addChild">＋ Adicionar filho(a)</button>
              </div>

              <div v-if="event.offerings.length && (visibleSession || mode === 'signup')" class="registration-section">
                <div class="registration-section__heading"><div><h3>Opções do evento</h3><p>Escolhas opcionais para esta participação.</p></div></div>
                <label v-for="offering in event.offerings" :key="offering.id" class="offering-option">
                  <input v-model="selectedOfferingIds" type="checkbox" :value="offering.id">
                  <span><strong>{{ offering.name }}</strong><small v-if="offering.description">{{ offering.description }}</small></span>
                  <b>{{ offering.priceCents ? priceLabel(offering.priceCents) : 'Grátis' }}</b>
                </label>
              </div>

              <EventPixPaymentCard
                v-if="selectedPaidAmountCents > 0 && event.pix && (visibleSession || mode === 'signup')"
                v-model="pixPaymentDeclared"
                :pix="event.pix"
                :amount-cents="selectedPaidAmountCents"
                :public-event-id="event.publicId"
              />

              <div v-if="event.fields.length && (visibleSession || mode === 'signup')" class="dynamic-fields">
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
                {{ loading ? 'Aguarde…' : !visibleSession && mode === 'login' ? 'Entrar e continuar' : 'Confirmar inscrição' }}
              </button>
              <p class="privacy-note">Seus dados são usados somente por esta comunidade para organizar o evento.</p>
            </form>
          </section>
        </div>
      </section>

      <section v-if="event.location" class="event-location" aria-labelledby="event-location-title">
        <div class="event-location__copy">
          <p class="eyebrow">Como chegar</p>
          <h2 id="event-location-title">Encontre o local do evento</h2>
          <p class="event-location__address">{{ event.location }}</p>
          <p>Consulte o mapa ou abra a rota no seu aplicativo de navegação.</p>
          <a
            class="button button--primary"
            :href="mapsDirectionsUrl"
            target="_blank"
            rel="noopener noreferrer"
          >Abrir rota no Google Maps</a>
        </div>
        <div class="event-location__map">
          <iframe
            :src="mapsEmbedUrl"
            :title="`Mapa de ${event.location}`"
            loading="lazy"
            referrerpolicy="no-referrer"
            allowfullscreen
          />
        </div>
      </section>

      <section v-if="event.images.length > 1 && event.mediaDisplayMode === 'carousel'" class="event-gallery" aria-label="Outras imagens do evento">
        <figure v-for="image in event.images.slice(1)" :key="image.id"><img :src="mediaUrl(image.id)" :alt="image.altText || event.title"></figure>
      </section>
      <section v-if="event.linkedGallery" class="linked-gallery-showcase">
        <div class="linked-gallery-showcase__copy">
          <p class="eyebrow">Memórias da comunidade</p>
          <h2>Veja como foi {{ event.linkedGallery.event.title }}</h2>
          <p>{{ event.linkedGallery.description || 'Relembre alguns momentos que vivemos juntos.' }}</p>
          <div><span>{{ linkedGalleryDate }}</span><span>{{ event.linkedGallery.photoCount }} {{ event.linkedGallery.photoCount === 1 ? 'foto' : 'fotos' }}</span></div>
          <NuxtLink :to="`/g/${event.linkedGallery.publicId}`" class="button button--primary">Abrir galeria completa</NuxtLink>
        </div>
        <NuxtLink :to="`/g/${event.linkedGallery.publicId}`" class="linked-gallery-showcase__cover" :aria-label="`Abrir ${event.linkedGallery.title}`">
          <img v-if="linkedGalleryCover" :src="linkedGalleryCover" :alt="event.linkedGallery.title">
          <span v-else aria-hidden="true">▧</span>
          <strong>{{ event.linkedGallery.title }}</strong>
        </NuxtLink>
      </section>
    </template>
  </main>
</template>

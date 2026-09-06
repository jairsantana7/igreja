<script setup lang="ts">
interface ManagedEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
  status: 'draft' | 'published' | 'registration_closed' | 'cancelled' | 'completed';
  mediaDisplayMode: 'hero' | 'carousel' | 'fixed';
  familyRegistrationEnabled: boolean;
  fields: Array<{ key: string; label: string; type: string; required: boolean; options: string[] }>;
  offerings: Array<{ key: string; name: string; description: string; priceCents: number }>;
}

useHead({ title: 'Editar evento' });
const route = useRoute();
const api = useApi();
const auth = useAuth();
const canUpdate = computed(() => auth.session.value?.user.permissions.includes('events.update'));
const canCancel = computed(() => auth.session.value?.user.permissions.includes('events.publish'));
const eventId = String(route.params.id);
const { data: event, pending, error } = await useAsyncData(`event-${eventId}`, () => api<ManagedEvent>(`/events/${eventId}`), { server: false });
const saving = ref(false);
const cancelling = ref(false);
const cancelDialogOpen = ref(false);
const errorMessage = ref('');
const images = ref<File[]>([]);
const previews = ref<string[]>([]);
const form = reactive({ title: '', description: '', location: '', startsAt: '', registrationDeadline: '', capacity: undefined as number | undefined, mediaDisplayMode: 'hero' as ManagedEvent['mediaDisplayMode'], familyRegistrationEnabled: false, fields: [] as any[], offerings: [] as any[] });

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

watch(event, (current) => {
  if (!current) return;
  Object.assign(form, {
    title: current.title,
    description: current.description,
    location: current.location,
    startsAt: localDateTime(current.startsAt),
    registrationDeadline: localDateTime(current.registrationDeadline),
    capacity: current.capacity ?? undefined,
    mediaDisplayMode: current.mediaDisplayMode,
    familyRegistrationEnabled: current.familyRegistrationEnabled,
    fields: current.fields.map((field) => ({ ...field, optionsText: field.options.join('\n') })),
    offerings: current.offerings.map((offering) => ({ ...offering, priceReais: offering.priceCents / 100 })),
  });
}, { immediate: true });

function addField() { form.fields.push({ key: '', label: '', type: 'short_text', required: false, optionsText: '' }); }
function removeField(index: number) { form.fields.splice(index, 1); }
function addOffering() { form.offerings.push({ key: '', name: '', description: '', priceReais: 0 }); }
function removeOffering(index: number) { form.offerings.splice(index, 1); }
function selectImages(domEvent: Event) {
  const selected = [...((domEvent.target as HTMLInputElement).files ?? [])];
  const invalid = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024);
  if (invalid) { errorMessage.value = 'Use imagens JPEG, PNG ou WebP com até 5 MiB cada.'; return; }
  previews.value.forEach(URL.revokeObjectURL);
  images.value = selected.slice(0, 10);
  previews.value = images.value.map(URL.createObjectURL);
}
onBeforeUnmount(() => previews.value.forEach(URL.revokeObjectURL));

async function save() {
  saving.value = true; errorMessage.value = '';
  try {
    await api(`/events/${eventId}`, {
      method: 'PUT',
      body: {
        ...form,
        registrationDeadline: form.registrationDeadline || undefined,
        capacity: form.capacity || undefined,
        fields: form.fields.map(({ optionsText, id: _id, ...field }) => ({ ...field, options: field.type === 'single_choice' ? optionsText.split('\n').map((value: string) => value.trim()).filter(Boolean) : [] })),
        offerings: form.offerings.map(({ priceReais, id: _id, ...offering }) => ({ ...offering, priceCents: Math.round(Number(priceReais || 0) * 100) })),
      },
    });
    if (images.value.length) {
      const body = new FormData();
      images.value.forEach((image) => body.append('images', image));
      await api(`/events/${eventId}/media`, { method: 'POST', body });
    }
    await navigateTo('/events');
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    errorMessage.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível atualizar o evento.';
  } finally { saving.value = false; }
}

async function cancelEvent() {
  if (!event.value) return;
  cancelling.value = true; errorMessage.value = '';
  try {
    await api(`/events/${eventId}/cancel`, { method: 'POST' });
    cancelDialogOpen.value = false;
    await navigateTo('/events');
  } catch (requestError: any) {
    errorMessage.value = requestError?.data?.message ?? 'Não foi possível cancelar o evento.';
  } finally { cancelling.value = false; }
}
</script>

<template>
  <div class="page page--narrow">
    <header class="page-header"><div><NuxtLink :to="`/events/${eventId}`" class="back-link">← Voltar à gestão</NuxtLink><p class="eyebrow">Eventos</p><h1>Editar evento</h1><p class="muted">O link e as inscrições existentes serão preservados.</p></div><button v-if="canCancel && event && ['draft', 'published', 'registration_closed'].includes(event.status)" class="button button--danger" type="button" :disabled="cancelling" @click="cancelDialogOpen = true"><span aria-hidden="true">⊘</span> Cancelar evento</button></header>
    <div v-if="pending" class="empty-card settings-loading">Carregando evento…</div>
    <div v-else-if="error || !event" class="empty-card settings-loading"><h3>Evento não encontrado</h3><p>Você pode não ter acesso ou o evento não pertence a esta comunidade.</p></div>
    <form v-else class="editor" @submit.prevent="save">
      <section class="editor-card"><div class="editor-card__heading"><span>1</span><div><h2>Detalhes do evento</h2><p>Editar não altera o status atual: {{ event.status === 'published' ? 'publicado' : event.status === 'draft' ? 'rascunho' : 'cancelado' }}.</p></div></div><div class="form-grid"><label class="field field--wide"><span>Título</span><input v-model="form.title" maxlength="160" required></label><label class="field"><span>Data e hora</span><input v-model="form.startsAt" type="datetime-local" required></label><label class="field"><span>Local</span><input v-model="form.location"></label><label class="field"><span>Inscrições até</span><input v-model="form.registrationDeadline" type="datetime-local"></label><label class="field"><span>Capacidade</span><input v-model.number="form.capacity" type="number" min="1" placeholder="Sem limite"></label><label class="field field--wide"><span>Descrição</span><textarea v-model="form.description" rows="5"></textarea></label></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>2</span><div><h2>Imagens</h2><p>As imagens existentes são preservadas; os novos arquivos serão acrescentados.</p></div></div><div class="media-editor"><label class="media-upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple @change="selectImages"><span>＋ Adicionar imagens</span><small>JPEG, PNG ou WebP · até 5 MiB</small></label><fieldset class="media-layout-options"><legend>Modo de exibição</legend><label v-for="option in [{ key: 'hero', label: 'Hero', hint: 'Capa ampla' }, { key: 'carousel', label: 'Carrossel', hint: 'Galeria navegável' }, { key: 'fixed', label: 'Fixa', hint: 'Fundo da página' }]" :key="option.key" :class="{ active: form.mediaDisplayMode === option.key }"><input v-model="form.mediaDisplayMode" type="radio" :value="option.key"><strong>{{ option.label }}</strong><small>{{ option.hint }}</small></label></fieldset></div><div v-if="previews.length" class="media-preview-list"><figure v-for="(preview, index) in previews" :key="preview"><img :src="preview" :alt="`Nova imagem ${index + 1}`"><figcaption>Nova imagem {{ index + 1 }}</figcaption></figure></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>3</span><div><h2>Participantes e formulário</h2><p>Campos que já possuem respostas não podem ser removidos.</p></div><button type="button" class="button" @click="addField">＋ Adicionar pergunta</button></div><label class="feature-option"><input v-model="form.familyRegistrationEnabled" type="checkbox"><span><strong>Permitir confirmação da família</strong><small>O responsável poderá escolher quem vai participar usando seu cadastro familiar.</small></span></label><div v-if="!form.fields.length" class="form-empty">Nenhuma pergunta adicional.</div><div v-for="(field, index) in form.fields" :key="field.key || index" class="field-builder"><span class="drag">⋮⋮</span><label class="field"><span>Pergunta</span><input v-model="field.label" required></label><label class="field"><span>Tipo</span><select v-model="field.type"><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="single_choice">Escolha única</option><option value="checkbox">Confirmação</option></select></label><label v-if="field.type === 'single_choice'" class="field field--wide"><span>Opções (uma por linha)</span><textarea v-model="field.optionsText" rows="3" required></textarea></label><label class="check"><input v-model="field.required" type="checkbox"> Obrigatório</label><button type="button" class="remove" aria-label="Remover campo" @click="removeField(index)">×</button></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>4</span><div><h2>Opções do evento</h2><p>Adicionais opcionais, como café da manhã. A escolha não representa pagamento confirmado.</p></div><button type="button" class="button" @click="addOffering">＋ Adicionar opção</button></div><div v-if="!form.offerings.length" class="form-empty">Nenhuma opção adicional configurada.</div><div v-for="(offering, index) in form.offerings" :key="offering.key || index" class="offering-builder"><label class="field"><span>Nome</span><input v-model="offering.name" required></label><label class="field"><span>Valor (R$)</span><input v-model.number="offering.priceReais" type="number" min="0" step="0.01"></label><label class="field field--wide"><span>Descrição</span><input v-model="offering.description"></label><button type="button" class="remove" aria-label="Remover opção" @click="removeOffering(index)">×</button></div></section>
      <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p><footer class="editor-actions"><span class="muted">Todas as alterações serão registradas na auditoria.</span><div><NuxtLink to="/events" class="button">Cancelar edição</NuxtLink><button v-if="canUpdate" class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar alterações' }}</button></div></footer>
    </form>
    <ConfirmDialog :open="cancelDialogOpen" :title="`Cancelar ${event?.title ?? 'evento'}?`" description="O link público será fechado imediatamente. Inscrições e respostas existentes continuarão disponíveis no histórico." confirm-label="Cancelar evento" :busy="cancelling" @cancel="cancelDialogOpen = false" @confirm="cancelEvent" />
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Novo evento' });
const api = useApi();
const auth = useAuth();
const saving = ref(false);
const errorMessage = ref('');
const form = reactive({ title: '', description: '', location: '', startsAt: '', registrationDeadline: '', capacity: undefined as number | undefined, mediaDisplayMode: 'hero' as 'hero' | 'carousel' | 'fixed', publish: true, fields: [] as any[] });
const images = ref<File[]>([]);
const previews = ref<string[]>([]);
const createdEvent = ref<any>(null);
interface EventTemplate { id: string; name: string; description: string; location: string; capacity: number | null; mediaDisplayMode: 'hero' | 'carousel' | 'fixed'; fields: Array<{ key: string; label: string; type: string; required: boolean; options: string[] }> }
const canUseTemplates = computed(() => auth.session.value?.user.permissions.includes('events.templates_manage'));
const { data: templates } = await useAsyncData('event-templates', () => canUseTemplates.value ? api<EventTemplate[]>('/event-templates') : Promise.resolve([]), { server: false });
const selectedTemplate = ref('');

function applyTemplate() {
  const template = templates.value?.find((item) => item.id === selectedTemplate.value);
  if (!template) return;
  form.description = template.description;
  form.location = template.location;
  form.capacity = template.capacity ?? undefined;
  form.mediaDisplayMode = template.mediaDisplayMode;
  form.fields = template.fields.map((field) => ({ ...field, optionsText: field.options.join('\n') }));
}

function addField() { form.fields.push({ key: '', label: '', type: 'short_text', required: false, optionsText: '' }); }
function removeField(index: number) { form.fields.splice(index, 1); }
function selectImages(event: Event) {
  const selected = [...((event.target as HTMLInputElement).files ?? [])];
  const invalid = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024);
  if (invalid) {
    errorMessage.value = 'Use imagens JPEG, PNG ou WebP com até 5 MiB cada.';
    return;
  }
  previews.value.forEach(URL.revokeObjectURL);
  images.value = selected.slice(0, 10);
  previews.value = images.value.map(URL.createObjectURL);
  errorMessage.value = selected.length > 10 ? 'Serão enviadas somente as 10 primeiras imagens.' : '';
}
onBeforeUnmount(() => previews.value.forEach(URL.revokeObjectURL));
async function save() {
  saving.value = true; errorMessage.value = '';
  try {
    const event = createdEvent.value ?? await api<any>('/events', { method: 'POST', body: { ...form, registrationDeadline: form.registrationDeadline || undefined, capacity: form.capacity || undefined, fields: form.fields.map(({ optionsText, ...field }) => ({ ...field, options: field.type === 'single_choice' ? optionsText.split('\n').map((v: string) => v.trim()).filter(Boolean) : [] })) } });
    createdEvent.value = event;
    if (images.value.length) {
      const body = new FormData();
      images.value.forEach((image) => body.append('images', image));
      await api(`/events/${event.id}/media`, { method: 'POST', body });
    }
    await navigateTo('/dashboard');
  } catch (error: any) { errorMessage.value = createdEvent.value ? 'O evento foi criado, mas não foi possível enviar as imagens. Tente novamente para concluir o upload.' : Array.isArray(error?.data?.message) ? error.data.message.join(' ') : error?.data?.message ?? 'Não foi possível salvar.'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="page page--narrow">
    <header class="page-header"><div><NuxtLink to="/dashboard" class="back-link">← Voltar</NuxtLink><p class="eyebrow">Eventos</p><h1>Criar novo evento</h1><p class="muted">Comece pelos detalhes e escolha o que perguntar na inscrição.</p></div></header>
    <form class="editor" @submit.prevent="save">
      <section v-if="templates?.length" class="editor-card template-picker"><div class="editor-card__heading"><span>↻</span><div><h2>Começar com um modelo</h2><p>Reaproveite uma estrutura e informe uma nova data para esta ocorrência.</p></div></div><div class="inline-operation-form"><label class="field"><span>Modelo</span><select v-model="selectedTemplate"><option value="">Selecione um modelo</option><option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option></select></label><button type="button" class="button" :disabled="!selectedTemplate" @click="applyTemplate">Aplicar modelo</button></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>1</span><div><h2>Detalhes do evento</h2><p>As informações que o membro verá.</p></div></div><div class="form-grid"><label class="field field--wide"><span>Título</span><input v-model="form.title" maxlength="160" placeholder="Encontro de famílias" required></label><label class="field"><span>Data e hora</span><input v-model="form.startsAt" type="datetime-local" required></label><label class="field"><span>Local</span><input v-model="form.location" placeholder="Auditório principal"></label><label class="field"><span>Inscrições até</span><input v-model="form.registrationDeadline" type="datetime-local"></label><label class="field"><span>Capacidade</span><input v-model.number="form.capacity" type="number" min="1" placeholder="Sem limite"></label><label class="field field--wide"><span>Descrição</span><textarea v-model="form.description" rows="5" placeholder="Conte às pessoas o que esperar deste encontro."></textarea></label></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>2</span><div><h2>Imagens do evento</h2><p>Adicione capas ou fotos e escolha como elas aparecem na página pública.</p></div></div><div class="media-editor"><label class="media-upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple @change="selectImages"><span>＋ Selecionar imagens</span><small>JPEG, PNG ou WebP · até 5 MiB por arquivo</small></label><fieldset class="media-layout-options"><legend>Modo de exibição</legend><label v-for="option in [{ key: 'hero', label: 'Hero', hint: 'Capa ampla' }, { key: 'carousel', label: 'Carrossel', hint: 'Galeria navegável' }, { key: 'fixed', label: 'Fixa', hint: 'Fundo da página' }]" :key="option.key" :class="{ active: form.mediaDisplayMode === option.key }"><input v-model="form.mediaDisplayMode" type="radio" :value="option.key"><strong>{{ option.label }}</strong><small>{{ option.hint }}</small></label></fieldset></div><div v-if="previews.length" class="media-preview-list"><figure v-for="(preview, index) in previews" :key="preview"><img :src="preview" :alt="`Prévia ${index + 1}`"><figcaption>{{ index === 0 ? 'Imagem principal' : `Imagem ${index + 1}` }}</figcaption></figure></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>3</span><div><h2>Formulário de inscrição</h2><p>Nome e e-mail já fazem parte da conta do membro.</p></div><button type="button" class="button" @click="addField">＋ Adicionar campo</button></div><div v-if="!form.fields.length" class="form-empty">Nenhuma pergunta adicional. Você pode publicar apenas com os dados da conta.</div><div v-for="(field, index) in form.fields" :key="index" class="field-builder"><span class="drag">⋮⋮</span><label class="field"><span>Pergunta</span><input v-model="field.label" placeholder="Ex.: Possui alguma restrição alimentar?" required></label><label class="field"><span>Tipo</span><select v-model="field.type"><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="single_choice">Escolha única</option><option value="checkbox">Confirmação</option></select></label><label v-if="field.type === 'single_choice'" class="field field--wide"><span>Opções (uma por linha)</span><textarea v-model="field.optionsText" rows="3" required></textarea></label><label class="check"><input v-model="field.required" type="checkbox"> Obrigatório</label><button type="button" class="remove" aria-label="Remover campo" @click="removeField(index)">×</button></div></section>
      <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p><footer class="editor-actions"><label class="check"><input v-model="form.publish" type="checkbox" :disabled="Boolean(createdEvent)"> Publicar e ativar o link agora</label><div><NuxtLink to="/dashboard" class="button">Cancelar</NuxtLink><button class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : createdEvent ? 'Tentar enviar imagens' : 'Salvar evento' }}</button></div></footer>
    </form>
  </div>
</template>

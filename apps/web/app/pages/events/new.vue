<script setup lang="ts">
useHead({ title: 'Novo evento' });
const api = useApi();
const saving = ref(false);
const errorMessage = ref('');
const form = reactive({ title: '', description: '', location: '', startsAt: '', registrationDeadline: '', capacity: undefined as number | undefined, publish: true, fields: [] as any[] });

function addField() { form.fields.push({ key: '', label: '', type: 'short_text', required: false, optionsText: '' }); }
function removeField(index: number) { form.fields.splice(index, 1); }
async function save() {
  saving.value = true; errorMessage.value = '';
  try {
    const event = await api<any>('/events', { method: 'POST', body: { ...form, registrationDeadline: form.registrationDeadline || undefined, capacity: form.capacity || undefined, fields: form.fields.map(({ optionsText, ...field }) => ({ ...field, options: field.type === 'single_choice' ? optionsText.split('\n').map((v: string) => v.trim()).filter(Boolean) : [] })) } });
    await navigateTo('/dashboard');
    if (event.status === 'published') setTimeout(() => {}, 0);
  } catch (error: any) { errorMessage.value = Array.isArray(error?.data?.message) ? error.data.message.join(' ') : error?.data?.message ?? 'Não foi possível salvar.'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="page page--narrow">
    <header class="page-header"><div><NuxtLink to="/dashboard" class="back-link">← Voltar</NuxtLink><p class="eyebrow">Eventos</p><h1>Criar novo evento</h1><p class="muted">Comece pelos detalhes e escolha o que perguntar na inscrição.</p></div></header>
    <form class="editor" @submit.prevent="save">
      <section class="editor-card"><div class="editor-card__heading"><span>1</span><div><h2>Detalhes do evento</h2><p>As informações que o membro verá.</p></div></div><div class="form-grid"><label class="field field--wide"><span>Título</span><input v-model="form.title" maxlength="160" placeholder="Encontro de famílias" required></label><label class="field"><span>Data e hora</span><input v-model="form.startsAt" type="datetime-local" required></label><label class="field"><span>Local</span><input v-model="form.location" placeholder="Auditório principal"></label><label class="field"><span>Inscrições até</span><input v-model="form.registrationDeadline" type="datetime-local"></label><label class="field"><span>Capacidade</span><input v-model.number="form.capacity" type="number" min="1" placeholder="Sem limite"></label><label class="field field--wide"><span>Descrição</span><textarea v-model="form.description" rows="5" placeholder="Conte às pessoas o que esperar deste encontro."></textarea></label></div></section>
      <section class="editor-card"><div class="editor-card__heading"><span>2</span><div><h2>Formulário de inscrição</h2><p>Nome e e-mail já fazem parte da conta do membro.</p></div><button type="button" class="button" @click="addField">＋ Adicionar campo</button></div><div v-if="!form.fields.length" class="form-empty">Nenhuma pergunta adicional. Você pode publicar apenas com os dados da conta.</div><div v-for="(field, index) in form.fields" :key="index" class="field-builder"><span class="drag">⋮⋮</span><label class="field"><span>Pergunta</span><input v-model="field.label" placeholder="Ex.: Possui alguma restrição alimentar?" required></label><label class="field"><span>Tipo</span><select v-model="field.type"><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="single_choice">Escolha única</option><option value="checkbox">Confirmação</option></select></label><label v-if="field.type === 'single_choice'" class="field field--wide"><span>Opções (uma por linha)</span><textarea v-model="field.optionsText" rows="3" required></textarea></label><label class="check"><input v-model="field.required" type="checkbox"> Obrigatório</label><button type="button" class="remove" aria-label="Remover campo" @click="removeField(index)">×</button></div></section>
      <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p><footer class="editor-actions"><label class="check"><input v-model="form.publish" type="checkbox"> Publicar e ativar o link agora</label><div><NuxtLink to="/dashboard" class="button">Cancelar</NuxtLink><button class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar evento' }}</button></div></footer>
    </form>
  </div>
</template>

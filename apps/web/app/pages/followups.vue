<script setup lang="ts">
interface Stage { id: string; name: string; color: string; position: number; isTerminal: boolean }
interface Tag { id: string; name: string; color: string }
interface Card { id: string; contactName: string; contactAddress: string; owner: { id: string; name: string }; stageId: string; nextActionAt: string | null; tags: Tag[]; conversationIds: string[]; noteCount: number; updatedAt: string }
interface Note { id: string; body: string; visibility: 'private' | 'team'; author: { id: string; name: string }; createdAt: string; own: boolean }
interface Detail extends Card { notes: Note[]; history: Array<{ id: string; fromStage: string | null; toStage: string; changedBy: string; changedAt: string }> }

useHead({ title: 'Acompanhamentos' });
const api = useApi();
const auth = useAuth();
const route = useRoute();
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canManage = computed(() => permissions.value.includes('followups.manage'));
const canManageNotes = computed(() => permissions.value.includes('followups.notes_manage'));
const canManagePipeline = computed(() => permissions.value.includes('followups.pipeline_manage'));
const { data: board, pending, error, refresh: refreshBoard } = await useAsyncData('followup-board', () => api<Card[]>('/followups'), { server: false });
const { data: stages, refresh: refreshStages } = await useAsyncData('followup-stages', () => api<Stage[]>('/followups/stages'), { server: false });
const { data: tags, refresh: refreshTags } = await useAsyncData('followup-tags', () => api<Tag[]>('/followups/tags'), { server: false });
const selectedId = ref(typeof route.query.selected === 'string' ? route.query.selected : '');
const { data: detail, pending: detailPending, refresh: refreshDetail } = await useAsyncData('followup-detail', () => selectedId.value ? api<Detail>(`/followups/${selectedId.value}`) : Promise.resolve(null), { server: false, immediate: false });
const draggingId = ref('');
const busy = ref(false);
const feedback = ref('');
const query = ref('');
const selectedTagIds = ref<string[]>([]);
const nextActionLocal = ref('');
const noteForm = reactive({ body: '', visibility: 'team' as 'private' | 'team' });
const showPipeline = ref(false);
const stageForm = reactive({ name: '', color: '#378661' });
const tagForm = reactive({ name: '', color: '#3B82F6' });
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const filteredBoard = computed(() => {
  const term = query.value.trim().toLocaleLowerCase('pt-BR');
  return (board.value ?? []).filter((card) => !term || card.contactName.toLocaleLowerCase('pt-BR').includes(term) || card.contactAddress.toLocaleLowerCase('pt-BR').includes(term) || card.tags.some((tag) => tag.name.toLocaleLowerCase('pt-BR').includes(term)));
});
const byStage = (stageId: string) => filteredBoard.value.filter((card) => card.stageId === stageId);
const isOverdue = (value: string | null) => Boolean(value && new Date(value).getTime() < Date.now());
const toLocalInput = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';

watch(selectedId, async (id) => { if (id) await refreshDetail(); else detail.value = null; });
watch(detail, (value) => {
  selectedTagIds.value = value?.tags.map((tag) => tag.id) ?? [];
  nextActionLocal.value = toLocalInput(value?.nextActionAt ?? null);
}, { immediate: true });
onMounted(() => { if (selectedId.value) void refreshDetail(); });

async function move(cardId: string, stageId: string) {
  if (!canManage.value) return;
  const card = board.value?.find((item) => item.id === cardId);
  if (!card || card.stageId === stageId) return;
  busy.value = true; feedback.value = '';
  try {
    await api(`/followups/${cardId}/stage`, { method: 'PUT', body: { stageId } });
    await refreshBoard();
    if (selectedId.value === cardId) await refreshDetail();
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível mover o acompanhamento.'; }
  finally { draggingId.value = ''; busy.value = false; }
}
async function saveDetails() {
  if (!detail.value) return;
  busy.value = true; feedback.value = '';
  try {
    await api(`/followups/${detail.value.id}`, { method: 'PUT', body: { tagIds: selectedTagIds.value, nextActionAt: nextActionLocal.value ? new Date(nextActionLocal.value).toISOString() : null } });
    feedback.value = 'Acompanhamento atualizado.';
    await Promise.all([refreshBoard(), refreshDetail()]);
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível atualizar o acompanhamento.'; }
  finally { busy.value = false; }
}
async function addNote() {
  if (!detail.value || !noteForm.body.trim()) return;
  busy.value = true; feedback.value = '';
  try {
    await api(`/followups/${detail.value.id}/notes`, { method: 'POST', body: noteForm });
    noteForm.body = ''; feedback.value = 'Anotação adicionada.';
    await Promise.all([refreshBoard(), refreshDetail()]);
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível adicionar a anotação.'; }
  finally { busy.value = false; }
}
async function removeNote(noteId: string) {
  if (!detail.value) return;
  busy.value = true;
  try { await api(`/followups/${detail.value.id}/notes/${noteId}`, { method: 'DELETE' }); await Promise.all([refreshBoard(), refreshDetail()]); }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível remover a anotação.'; }
  finally { busy.value = false; }
}
async function createStage() {
  busy.value = true; feedback.value = '';
  try { await api('/followups/stages', { method: 'POST', body: stageForm }); Object.assign(stageForm, { name: '', color: '#378661' }); await refreshStages(); }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível criar a etapa.'; }
  finally { busy.value = false; }
}
async function createTag() {
  busy.value = true; feedback.value = '';
  try { await api('/followups/tags', { method: 'POST', body: tagForm }); Object.assign(tagForm, { name: '', color: '#3B82F6' }); await refreshTags(); }
  catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível criar a etiqueta.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="page page--followups">
    <header class="page-header"><div><p class="eyebrow">Cuidado e relacionamento</p><h1>Acompanhamentos</h1><p class="muted">Organize próximos passos sem perder o contexto das conversas.</p></div><button v-if="canManagePipeline" class="button" type="button" @click="showPipeline = !showPipeline">⚙ Etapas e etiquetas</button></header>
    <p v-if="feedback" class="operation-feedback" role="status">{{ feedback }}</p>
    <section v-if="showPipeline" class="followup-settings"><div><p class="eyebrow">Personalização</p><h2>Organização do quadro</h2><p>Crie etapas e etiquetas com o vocabulário da sua comunidade.</p></div><form @submit.prevent="createStage"><label class="field"><span>Nova etapa</span><input v-model="stageForm.name" minlength="2" maxlength="60" required></label><input v-model="stageForm.color" type="color" aria-label="Cor da etapa"><button class="button" :disabled="busy">Adicionar etapa</button></form><form @submit.prevent="createTag"><label class="field"><span>Nova etiqueta</span><input v-model="tagForm.name" minlength="2" maxlength="40" required></label><input v-model="tagForm.color" type="color" aria-label="Cor da etiqueta"><button class="button" :disabled="busy">Adicionar etiqueta</button></form></section>
    <div class="followup-toolbar"><label class="search-field"><span>⌕</span><input v-model="query" type="search" placeholder="Buscar pessoa, número ou etiqueta"></label><span>{{ filteredBoard.length }} acompanhamento(s)</span></div>
    <div v-if="pending" class="empty-card">Carregando acompanhamentos…</div><div v-else-if="error" class="empty-card">Não foi possível carregar o quadro.</div>
    <section v-else class="followup-workspace" :class="{ 'followup-workspace--detail': selectedId }">
      <div class="followup-board">
        <section v-for="stage in stages" :key="stage.id" class="followup-column" @dragover.prevent @drop="move(draggingId, stage.id)">
          <header><span :style="{ background: stage.color }"/><h2>{{ stage.name }}</h2><b>{{ byStage(stage.id).length }}</b></header>
          <div class="followup-column__cards"><button v-for="card in byStage(stage.id)" :key="card.id" class="followup-card" :class="{ active: selectedId === card.id }" type="button" :draggable="canManage" @dragstart="draggingId = card.id" @click="selectedId = card.id"><div class="followup-card__identity"><span>{{ card.contactName.charAt(0).toUpperCase() }}</span><div><strong>{{ card.contactName }}</strong><small>{{ card.contactAddress }}</small></div></div><div v-if="card.tags.length" class="followup-tags"><i v-for="tag in card.tags" :key="tag.id" :style="{ '--tag-color': tag.color }">{{ tag.name }}</i></div><p><span>{{ card.owner.name }}</span><span v-if="card.noteCount">✎ {{ card.noteCount }}</span></p><time v-if="card.nextActionAt" :class="{ overdue: isOverdue(card.nextActionAt) }">{{ isOverdue(card.nextActionAt) ? 'Atrasado · ' : 'Próximo contato · ' }}{{ formatter.format(new Date(card.nextActionAt)) }}</time></button><div v-if="!byStage(stage.id).length" class="followup-column__empty">Solte um acompanhamento aqui</div></div>
        </section>
      </div>
      <aside v-if="selectedId" class="followup-detail"><button class="icon-close" type="button" aria-label="Fechar detalhes" @click="selectedId = ''">×</button><p v-if="detailPending">Carregando…</p><template v-else-if="detail"><p class="eyebrow">Acompanhamento</p><h2>{{ detail.contactName }}</h2><p class="muted">{{ detail.contactAddress }} · responsável: {{ detail.owner.name }}</p><NuxtLink v-if="detail.conversationIds[0]" :to="{ path: '/conversations', query: { selected: detail.conversationIds[0] } }" class="button button--small">◌ Abrir conversa</NuxtLink><form v-if="canManage" class="followup-detail-form" @submit.prevent="saveDetails"><label class="field"><span>Etapa atual</span><select :value="detail.stageId" @change="move(detail.id, ($event.target as HTMLSelectElement).value)"><option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.name }}</option></select></label><label class="field"><span>Próxima ação</span><input v-model="nextActionLocal" type="datetime-local"></label><fieldset><legend>Etiquetas</legend><label v-for="tag in tags" :key="tag.id"><input v-model="selectedTagIds" type="checkbox" :value="tag.id"><span :style="{ '--tag-color': tag.color }">{{ tag.name }}</span></label><small v-if="!tags?.length">Nenhuma etiqueta cadastrada.</small></fieldset><button class="button button--primary" :disabled="busy">Salvar organização</button></form><section class="followup-notes"><header><div><p class="eyebrow">Memória interna</p><h3>Anotações</h3></div><small>Nunca são enviadas ao contato.</small></header><form v-if="canManageNotes" @submit.prevent="addNote"><textarea v-model="noteForm.body" rows="4" maxlength="5000" placeholder="Registre contexto e o próximo passo…" required></textarea><div><select v-model="noteForm.visibility"><option value="team">Compartilhar com a equipe</option><option value="private">Somente eu</option></select><button class="button button--primary" :disabled="busy">Adicionar</button></div></form><article v-for="note in detail.notes" :key="note.id"><header><strong>{{ note.author.name }}</strong><span>{{ note.visibility === 'private' ? 'Privada' : 'Equipe' }}</span></header><p>{{ note.body }}</p><footer><time>{{ formatter.format(new Date(note.createdAt)) }}</time><button v-if="note.own && canManageNotes" type="button" @click="removeNote(note.id)">Remover</button></footer></article><p v-if="!detail.notes.length" class="muted">Nenhuma anotação visível para você.</p></section><details class="followup-history"><summary>Histórico de etapas</summary><ol><li v-for="change in detail.history" :key="change.id"><span :style="{ background: stages?.find(stage => stage.name === change.toStage)?.color }"/><p><strong>{{ change.fromStage ? `${change.fromStage} → ${change.toStage}` : `Iniciado em ${change.toStage}` }}</strong><small>{{ change.changedBy }} · {{ formatter.format(new Date(change.changedAt)) }}</small></p></li></ol></details></template></aside>
    </section>
  </div>
</template>

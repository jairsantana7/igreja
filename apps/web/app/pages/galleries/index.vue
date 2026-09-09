<script setup lang="ts">
type GalleryStatus = 'draft' | 'published' | 'archived';
interface GalleryEvent { id: string; title: string; startsAt: string; location: string; owner: { id: string; name: string } }
interface Gallery { id: string; publicId: string; title: string; description: string; visibility: 'public' | 'members_only'; status: GalleryStatus; publishedAt: string | null; photoCount: number; coverPhotoId: string | null; event: GalleryEvent; updatedAt: string }

useHead({ title: 'Galerias' });
const api = useApi();
const auth = useAuth();
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canCreate = computed(() => permissions.value.includes('galleries.create'));
const showCreate = ref(false);
const saving = ref(false);
const feedback = ref('');
const form = reactive({ eventId: '', title: '', description: '', visibility: 'public' as Gallery['visibility'] });
const { data: galleries, pending, error, refresh } = await useAsyncData('galleries', () => api<Gallery[]>('/galleries'), { server: false });
const { data: events, refresh: refreshEvents } = await useAsyncData('gallery-events', () => canCreate.value ? api<GalleryEvent[]>('/galleries/events') : Promise.resolve([]), { server: false, watch: [canCreate] });
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
const statusLabel: Record<GalleryStatus, string> = { draft: 'Rascunho', published: 'Publicada', archived: 'Arquivada' };

watch(() => form.eventId, (id) => {
  const event = events.value?.find((item) => item.id === id);
  if (event && !form.title) form.title = event.title;
});

async function createGallery() {
  saving.value = true; feedback.value = '';
  try {
    const gallery = await api<Gallery>('/galleries', { method: 'POST', body: form });
    await navigateTo(`/galleries/${gallery.id}`);
  } catch (requestError: any) { feedback.value = requestError?.data?.message ?? 'Não foi possível criar a galeria.'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="page galleries-page">
    <header class="page-header">
      <div><p class="eyebrow">Memória da comunidade</p><h1>Galerias</h1><p class="muted">Transforme eventos concluídos em histórias que podem ser revisitadas e compartilhadas.</p></div>
      <button v-if="canCreate" class="button button--primary" type="button" @click="showCreate = !showCreate">＋ Nova galeria</button>
    </header>

    <form v-if="showCreate" class="gallery-create-card" @submit.prevent="createGallery">
      <div class="gallery-create-card__heading"><div><p class="eyebrow">Começar</p><h2>Escolha um evento concluído</h2></div><button type="button" class="gallery-close" aria-label="Fechar" @click="showCreate = false">×</button></div>
      <div v-if="events?.length" class="gallery-form-grid">
        <label class="field"><span>Evento</span><select v-model="form.eventId" required><option value="" disabled>Selecione o evento</option><option v-for="event in events" :key="event.id" :value="event.id">{{ event.title }} · {{ formatter.format(new Date(event.startsAt)) }}</option></select></label>
        <label class="field"><span>Título da galeria</span><input v-model="form.title" minlength="3" maxlength="160" required></label>
        <label class="field gallery-form-grid__wide"><span>Uma breve lembrança</span><textarea v-model="form.description" rows="3" maxlength="3000" placeholder="Conte em poucas palavras como foi este encontro…" /></label>
        <label class="field"><span>Quem pode ver</span><select v-model="form.visibility"><option value="public">Qualquer pessoa com o link</option><option value="members_only">Somente membros conectados</option></select></label>
        <div class="gallery-create-card__actions"><button class="button button--primary" :disabled="saving">{{ saving ? 'Criando…' : 'Criar e adicionar fotos' }}</button></div>
      </div>
      <div v-else class="gallery-inline-empty"><p>Todos os eventos concluídos disponíveis já possuem galeria.</p><NuxtLink to="/events" class="button">Ver eventos</NuxtLink></div>
      <p v-if="feedback" class="alert" role="alert">{{ feedback }}</p>
    </form>

    <div v-if="pending" class="empty-card">Carregando galerias…</div>
    <div v-else-if="error" class="empty-card"><p>Não foi possível carregar as galerias.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
    <section v-else-if="galleries?.length" class="gallery-list" aria-label="Galerias da comunidade">
      <article v-for="gallery in galleries" :key="gallery.id" class="gallery-list-card">
        <div class="gallery-list-card__visual"><span>▧</span><b>{{ gallery.photoCount }}</b><small>{{ gallery.photoCount === 1 ? 'foto' : 'fotos' }}</small></div>
        <div class="gallery-list-card__body">
          <div><span class="badge" :class="`badge--gallery-${gallery.status}`">{{ statusLabel[gallery.status] }}</span><span class="gallery-visibility">{{ gallery.visibility === 'public' ? 'Pública' : 'Só para membros' }}</span></div>
          <h2>{{ gallery.title }}</h2><p>{{ gallery.description || 'Uma memória deste encontro da comunidade.' }}</p>
          <dl><div><dt>Evento</dt><dd>{{ formatter.format(new Date(gallery.event.startsAt)) }}</dd></div><div><dt>Responsável</dt><dd>{{ gallery.event.owner.name }}</dd></div></dl>
          <div class="gallery-list-card__actions"><NuxtLink :to="`/galleries/${gallery.id}`" class="button button--primary">Gerenciar</NuxtLink><NuxtLink v-if="gallery.status === 'published'" :to="`/g/${gallery.publicId}`" target="_blank" class="button">Abrir página ↗</NuxtLink></div>
        </div>
      </article>
    </section>
    <div v-else class="empty-card gallery-empty"><span class="empty-icon">▧</span><h3>A memória começa no primeiro álbum</h3><p>Conclua um evento e reúna aqui as fotos que contam essa história.</p><button v-if="canCreate" class="button button--primary" @click="showCreate = true">Criar primeira galeria</button></div>
  </div>
</template>

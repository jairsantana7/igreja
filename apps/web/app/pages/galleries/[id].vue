<script setup lang="ts">
type GalleryStatus = 'draft' | 'published' | 'archived';
interface Photo { id: string; caption: string; altText: string; position: number; isCover: boolean; processingStatus: 'pending' | 'ready' | 'failed'; createdAt: string }
interface Gallery { id: string; publicId: string; title: string; description: string; visibility: 'public' | 'members_only'; status: GalleryStatus; publishedAt: string | null; event: { id: string; title: string; startsAt: string; location: string; owner: { id: string; name: string } }; photos: Photo[] }
interface EventItem { id: string; title: string; status: string }

useHead({ title: 'Gerenciar galeria' });
const route = useRoute(); const api = useApi(); const auth = useAuth(); const galleryId = String(route.params.id);
const permissions = computed(() => auth.session.value?.user.permissions ?? []);
const canUpdate = computed(() => permissions.value.includes('galleries.update'));
const canPublish = computed(() => permissions.value.includes('galleries.publish'));
const canReuse = computed(() => permissions.value.includes('galleries.reuse') && permissions.value.includes('events.update'));
const busy = ref(''); const feedback = ref(''); const selectedFiles = ref<File[]>([]); const photoToDelete = ref<Photo | null>(null); const reusePhoto = ref<Photo | null>(null); const targetEventId = ref('');
const photoUrls = reactive<Record<string, string>>({}); const editors = reactive<Record<string, { caption: string; altText: string }>>({});
const details = reactive({ title: '', description: '', visibility: 'public' as Gallery['visibility'] });
const { data: gallery, pending, error, refresh } = await useAsyncData(`gallery-${galleryId}`, () => api<Gallery>(`/galleries/${galleryId}`), { server: false });
const { data: events } = await useAsyncData('gallery-reuse-events', () => canReuse.value ? api<EventItem[]>('/events') : Promise.resolve([]), { server: false, watch: [canReuse] });
const reusableEvents = computed(() => (events.value ?? []).filter((event) => !['cancelled', 'completed'].includes(event.status) && event.id !== gallery.value?.event.id));
const publicLink = computed(() => import.meta.client && gallery.value ? `${location.origin}/g/${gallery.value.publicId}` : '');

watch(gallery, async (value) => {
  if (!value) return;
  Object.assign(details, { title: value.title, description: value.description, visibility: value.visibility });
  value.photos.forEach((photo) => { editors[photo.id] = { caption: photo.caption, altText: photo.altText }; });
  await loadPhotoUrls(value.photos);
}, { immediate: true });
onBeforeUnmount(() => Object.values(photoUrls).forEach(URL.revokeObjectURL));

async function loadPhotoUrls(photos: Photo[]) {
  const missing = photos.filter((photo) => !photoUrls[photo.id]);
  await Promise.all(missing.map(async (photo) => {
    try { const blob = await api<Blob>(`/galleries/${galleryId}/photos/${photo.id}/thumbnail`, { responseType: 'blob' }); photoUrls[photo.id] = URL.createObjectURL(blob); } catch { /* O card mantém o placeholder. */ }
  }));
}
function message(error: any, fallback: string) { feedback.value = error?.data?.message ?? fallback; }
async function saveDetails() { busy.value = 'details'; feedback.value = ''; try { await api(`/galleries/${galleryId}`, { method: 'PUT', body: details }); await refresh(); feedback.value = 'Informações da galeria atualizadas.'; } catch (e) { message(e, 'Não foi possível atualizar a galeria.'); } finally { busy.value = ''; } }
async function changeStatus(status: GalleryStatus) { busy.value = 'status'; feedback.value = ''; try { await api(`/galleries/${galleryId}/status`, { method: 'PATCH', body: { status } }); await refresh(); feedback.value = status === 'published' ? 'Galeria publicada e pronta para compartilhar.' : status === 'archived' ? 'Galeria arquivada.' : 'Galeria voltou para rascunho.'; } catch (e) { message(e, 'Não foi possível alterar a publicação.'); } finally { busy.value = ''; } }
function chooseFiles(event: Event) { selectedFiles.value = Array.from((event.target as HTMLInputElement).files ?? []); }
async function upload() { if (!selectedFiles.value.length) return; busy.value = 'upload'; feedback.value = ''; const body = new FormData(); selectedFiles.value.forEach((file) => body.append('images', file)); try { await api(`/galleries/${galleryId}/photos`, { method: 'POST', body }); selectedFiles.value = []; await refresh(); feedback.value = 'Fotos adicionadas. Você já pode preencher os textos alternativos.'; } catch (e) { message(e, 'Não foi possível enviar as fotos.'); } finally { busy.value = ''; } }
async function savePhoto(photo: Photo, isCover?: boolean) { busy.value = photo.id; feedback.value = ''; try { await api(`/galleries/${galleryId}/photos/${photo.id}`, { method: 'PATCH', body: { ...editors[photo.id], ...(isCover === undefined ? {} : { isCover }) } }); await refresh(); feedback.value = isCover ? 'Capa da galeria atualizada.' : 'Foto atualizada.'; } catch (e) { message(e, 'Não foi possível atualizar a foto.'); } finally { busy.value = ''; } }
async function move(photo: Photo, step: number) { const ids = [...(gallery.value?.photos.map((item) => item.id) ?? [])]; const index = ids.indexOf(photo.id); const next = index + step; if (next < 0 || next >= ids.length) return; [ids[index], ids[next]] = [ids[next]!, ids[index]!]; busy.value = photo.id; try { await api(`/galleries/${galleryId}/photos/order`, { method: 'PUT', body: { photoIds: ids } }); await refresh(); } catch (e) { message(e, 'Não foi possível reordenar as fotos.'); } finally { busy.value = ''; } }
async function removePhoto() { if (!photoToDelete.value) return; busy.value = photoToDelete.value.id; try { await api(`/galleries/${galleryId}/photos/${photoToDelete.value.id}`, { method: 'DELETE' }); const url = photoUrls[photoToDelete.value.id]; if (url) URL.revokeObjectURL(url); delete photoUrls[photoToDelete.value.id]; photoToDelete.value = null; await refresh(); feedback.value = 'Foto excluída da galeria.'; } catch (e) { message(e, 'Não foi possível excluir a foto.'); } finally { busy.value = ''; } }
async function reuse() { if (!reusePhoto.value || !targetEventId.value) return; busy.value = 'reuse'; try { await api(`/galleries/${galleryId}/photos/${reusePhoto.value.id}/reuse`, { method: 'POST', body: { eventId: targetEventId.value } }); reusePhoto.value = null; targetEventId.value = ''; feedback.value = 'Foto copiada para a mídia do evento escolhido.'; } catch (e) { message(e, 'Não foi possível reaproveitar a foto.'); } finally { busy.value = ''; } }
async function copyLink() { await navigator.clipboard.writeText(publicLink.value); feedback.value = 'Link público copiado.'; }
</script>

<template>
  <div class="page gallery-manager">
    <header class="page-header"><div><NuxtLink to="/galleries" class="back-link">← Voltar às galerias</NuxtLink><p class="eyebrow">{{ gallery?.event.title ?? 'Galeria' }}</p><h1>{{ gallery?.title ?? 'Carregando…' }}</h1><p v-if="gallery" class="muted">{{ gallery.photos.length }} {{ gallery.photos.length === 1 ? 'foto' : 'fotos' }} · {{ gallery.visibility === 'public' ? 'acesso público' : 'somente membros' }}</p></div><div v-if="gallery" class="gallery-header-actions"><NuxtLink v-if="gallery.status === 'published'" :to="`/g/${gallery.publicId}`" target="_blank" class="button">Visualizar ↗</NuxtLink><button v-if="gallery.status === 'published'" class="button" @click="copyLink">Copiar link</button><button v-if="canPublish && gallery.status !== 'published'" class="button button--primary" :disabled="busy === 'status'" @click="changeStatus('published')">Publicar galeria</button><button v-else-if="canPublish" class="button" :disabled="busy === 'status'" @click="changeStatus('draft')">Retirar do ar</button></div></header>
    <p v-if="feedback" class="alert gallery-feedback" role="status">{{ feedback }}</p>
    <div v-if="pending" class="empty-card">Carregando galeria…</div><div v-else-if="error || !gallery" class="empty-card"><p>Não foi possível abrir esta galeria.</p><NuxtLink to="/galleries" class="button">Voltar</NuxtLink></div>
    <template v-else>
      <section class="gallery-manager-grid">
        <form class="section-block gallery-details-card" @submit.prevent="saveDetails"><p class="eyebrow">Apresentação</p><h2>Conte a história do encontro</h2><label class="field"><span>Título</span><input v-model="details.title" maxlength="160" :disabled="!canUpdate" required></label><label class="field"><span>Descrição</span><textarea v-model="details.description" rows="5" maxlength="3000" :disabled="!canUpdate" /></label><label class="field"><span>Visibilidade</span><select v-model="details.visibility" :disabled="!canUpdate"><option value="public">Qualquer pessoa com o link</option><option value="members_only">Somente membros conectados</option></select></label><button v-if="canUpdate" class="button button--primary" :disabled="busy === 'details'">{{ busy === 'details' ? 'Salvando…' : 'Salvar apresentação' }}</button></form>
        <aside class="section-block gallery-publish-card"><p class="eyebrow">Publicação</p><span class="gallery-status-mark" :class="`gallery-status-mark--${gallery.status}`">{{ gallery.status === 'published' ? 'Publicada' : gallery.status === 'archived' ? 'Arquivada' : 'Rascunho' }}</span><p v-if="gallery.status === 'draft'">Para publicar, inclua ao menos uma foto e preencha o texto alternativo de todas elas.</p><p v-else-if="gallery.status === 'published'">A página está disponível conforme a visibilidade escolhida.</p><p v-else>O álbum fica preservado para a equipe, mas não aparece no link.</p><button v-if="canPublish && gallery.status !== 'archived'" class="button button--danger" @click="changeStatus('archived')">Arquivar</button><button v-else-if="canPublish" class="button" @click="changeStatus('draft')">Restaurar como rascunho</button></aside>
      </section>

      <section class="section-block gallery-photos-section"><header><div><p class="eyebrow">Fotos</p><h2>Organize a narrativa visual</h2><p class="muted">A primeira foto vira capa automaticamente. Ajuste a ordem e descreva cada imagem para acessibilidade.</p></div><label v-if="canUpdate" class="button gallery-upload-button"><input type="file" multiple accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="chooseFiles">Escolher fotos</label></header>
        <div v-if="selectedFiles.length" class="gallery-upload-tray"><span>{{ selectedFiles.length }} {{ selectedFiles.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados' }}</span><button class="button button--primary" :disabled="busy === 'upload'" @click="upload">{{ busy === 'upload' ? 'Enviando…' : 'Adicionar à galeria' }}</button></div>
        <div v-if="gallery.photos.length" class="gallery-photo-grid">
          <article v-for="(photo, index) in gallery.photos" :key="photo.id" class="gallery-photo-card" :class="{ 'gallery-photo-card--cover': photo.isCover }"><div class="gallery-photo-card__image"><img v-if="photoUrls[photo.id]" :src="photoUrls[photo.id]" :alt="photo.altText"><span v-else>Processando imagem…</span><b v-if="photo.isCover">Capa</b><small v-if="photo.processingStatus === 'failed'">Original preservado</small></div><div class="gallery-photo-card__editor"><label class="field"><span>Legenda</span><input v-model="editors[photo.id]!.caption" maxlength="500" placeholder="Uma lembrança sobre esta foto"></label><label class="field"><span>Texto alternativo <b>*</b></span><input v-model="editors[photo.id]!.altText" maxlength="180" placeholder="Descreva o que aparece na imagem"></label><div class="gallery-photo-card__actions"><button class="button button--primary" :disabled="busy === photo.id" @click="savePhoto(photo)">Salvar</button><button v-if="!photo.isCover" class="button" @click="savePhoto(photo, true)">Usar como capa</button><button class="gallery-icon-button" :disabled="index === 0" aria-label="Mover para antes" @click="move(photo, -1)">←</button><button class="gallery-icon-button" :disabled="index === gallery.photos.length - 1" aria-label="Mover para depois" @click="move(photo, 1)">→</button><button v-if="canReuse" class="gallery-text-button" @click="reusePhoto = photo">Reaproveitar</button><button class="gallery-text-button gallery-text-button--danger" @click="photoToDelete = photo">Excluir</button></div></div></article>
        </div><div v-else class="gallery-inline-empty"><span class="empty-icon">▧</span><h3>Adicione as primeiras fotos</h3><p>JPEG, PNG ou WebP, até 10 MiB por foto e 20 arquivos por envio.</p></div>
      </section>
    </template>

    <ConfirmDialog :open="Boolean(photoToDelete)" title="Excluir esta foto?" description="A imagem e suas versões serão removidas da galeria. Esta ação fica registrada na auditoria." confirm-label="Excluir foto" :busy="Boolean(photoToDelete && busy === photoToDelete.id)" @cancel="photoToDelete = null" @confirm="removePhoto" />
    <div v-if="reusePhoto" class="gallery-modal-backdrop" @click.self="reusePhoto = null"><form class="gallery-modal" @submit.prevent="reuse"><button type="button" class="gallery-close" @click="reusePhoto = null">×</button><p class="eyebrow">Reaproveitar foto</p><h2>Copiar para outro evento</h2><p>A foto será copiada; a galeria original continuará intacta.</p><label class="field"><span>Evento de destino</span><select v-model="targetEventId" required><option value="" disabled>Selecione um evento</option><option v-for="event in reusableEvents" :key="event.id" :value="event.id">{{ event.title }}</option></select></label><p v-if="!reusableEvents.length" class="muted">Não há evento editável disponível neste momento.</p><button class="button button--primary" :disabled="busy === 'reuse' || !targetEventId">{{ busy === 'reuse' ? 'Copiando…' : 'Copiar foto' }}</button></form></div>
  </div>
</template>

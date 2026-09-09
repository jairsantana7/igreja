<script setup lang="ts">
definePageMeta({ layout: 'login' });
interface PublicPhoto { id: string; caption: string; altText: string; isCover: boolean }
interface PublicGallery { id: string; publicId: string; communityName: string; title: string; description: string; visibility: 'public' | 'members_only'; publishedAt: string | null; event: { id: string; title: string; startsAt: string; location: string }; photos: PublicPhoto[] }

const route = useRoute(); const api = useApi(); const auth = useAuth(); const config = useRuntimeConfig(); const publicId = String(route.params.publicId);
const gallery = ref<PublicGallery | null>(null); const pending = ref(true); const membersOnly = ref(false); const errorMessage = ref(''); const protectedUrls = reactive<Record<string, string>>({}); const selected = ref<PublicPhoto | null>(null);
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
const cover = computed(() => gallery.value?.photos.find((photo) => photo.isCover) ?? gallery.value?.photos[0]);
const apiBase = String(config.public.apiBaseUrl).replace(/\/$/, '');
function publicPhotoUrl(photo: PublicPhoto, variant = 'display') { return `${apiBase}/public/galleries/${publicId}/photos/${photo.id}/${variant}`; }
function photoUrl(photo: PublicPhoto) { return protectedUrls[photo.id] ?? publicPhotoUrl(photo); }

async function load() {
  pending.value = true; errorMessage.value = ''; membersOnly.value = false;
  try {
    const protectedAccess = Boolean(auth.session.value);
    gallery.value = await api<PublicGallery>(protectedAccess ? `/galleries/shared/${publicId}` : `/public/galleries/${publicId}`);
    if (protectedAccess) await Promise.all(gallery.value.photos.map(async (photo) => {
      const blob = await api<Blob>(`/galleries/shared/${publicId}/photos/${photo.id}/display`, { responseType: 'blob' });
      protectedUrls[photo.id] = URL.createObjectURL(blob);
    }));
  } catch (error: any) {
    if (error?.status === 403 || error?.statusCode === 403 || error?.response?.status === 403) membersOnly.value = true;
    else errorMessage.value = error?.data?.message ?? 'Esta galeria não está disponível.';
  } finally { pending.value = false; }
}
onMounted(load);
onBeforeUnmount(() => Object.values(protectedUrls).forEach(URL.revokeObjectURL));
useHead(() => ({ title: gallery.value?.title ?? 'Galeria do evento' }));
</script>

<template>
  <main class="public-gallery-page">
    <div v-if="pending" class="public-gallery-state"><AppLogo light /><p>Preparando as lembranças…</p></div>
    <div v-else-if="membersOnly" class="public-gallery-state"><AppLogo light /><span>Galeria da comunidade</span><h1>Esta história é para membros</h1><p>Entre com sua conta para ver as fotos compartilhadas pela comunidade.</p><NuxtLink :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`" class="button button--primary">Entrar para visualizar</NuxtLink></div>
    <div v-else-if="errorMessage || !gallery" class="public-gallery-state"><AppLogo light /><h1>Galeria indisponível</h1><p>{{ errorMessage }}</p></div>
    <template v-else>
      <header class="public-gallery-hero">
        <img v-if="cover" :src="photoUrl(cover)" :alt="cover.altText"><div class="public-gallery-hero__shade" />
        <nav><AppLogo light /><span>{{ gallery.communityName }}</span></nav>
        <div class="public-gallery-hero__copy"><p class="eyebrow eyebrow--light">Memórias de {{ formatter.format(new Date(gallery.event.startsAt)) }}</p><h1>{{ gallery.title }}</h1><p>{{ gallery.description || `Um pouco do que vivemos em ${gallery.event.title}.` }}</p><dl><div v-if="gallery.event.location"><dt>Onde foi</dt><dd>{{ gallery.event.location }}</dd></div><div><dt>Fotos</dt><dd>{{ gallery.photos.length }}</dd></div></dl><a href="#fotos" class="public-gallery-scroll">Ver as fotos ↓</a></div>
      </header>
      <section id="fotos" class="public-gallery-content"><header><p class="eyebrow">Nossa história</p><h2>Momentos deste encontro</h2><p>Clique em uma foto para ampliar.</p></header><div class="public-gallery-mosaic"><figure v-for="(photo, index) in gallery.photos" :key="photo.id" :class="{ 'public-gallery-mosaic__featured': index === 0 || photo.isCover }" @click="selected = photo"><img :src="photoUrl(photo)" :alt="photo.altText" loading="lazy"><figcaption v-if="photo.caption">{{ photo.caption }}</figcaption></figure></div></section>
      <footer class="public-gallery-footer"><AppLogo /><p>Memórias cuidadas por {{ gallery.communityName }}.</p></footer>
      <div v-if="selected" class="public-gallery-lightbox" role="dialog" aria-modal="true" :aria-label="selected.altText" @click.self="selected = null"><button aria-label="Fechar" @click="selected = null">×</button><img :src="photoUrl(selected)" :alt="selected.altText"><p v-if="selected.caption">{{ selected.caption }}</p></div>
    </template>
  </main>
</template>

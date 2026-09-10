<script setup lang="ts">
import QRCode from 'qrcode';
import { buildPublicEventUrl, publicEventQrFilename } from '~/utils/public-event-share';

const props = defineProps<{ publicId: string; title: string }>();
const publicUrl = ref('');
const qrImage = ref('');
const feedback = ref('');

async function generateQrCode() {
  if (!import.meta.client) return;
  publicUrl.value = buildPublicEventUrl(window.location.origin, props.publicId);
  try {
    qrImage.value = await QRCode.toDataURL(publicUrl.value, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#102B24', light: '#FFFFFF' },
    });
  } catch {
    feedback.value = 'Não foi possível gerar o QR Code neste navegador.';
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    feedback.value = 'Link copiado.';
  } catch {
    feedback.value = 'Não foi possível copiar. Selecione o endereço abaixo.';
  }
}

function downloadQrCode() {
  if (!qrImage.value) return;
  const link = document.createElement('a');
  link.href = qrImage.value;
  link.download = publicEventQrFilename(props.title);
  link.click();
  feedback.value = 'QR Code baixado.';
}

onMounted(generateQrCode);
watch(() => props.publicId, generateQrCode);
</script>

<template>
  <article class="operation-card event-share-card">
    <div class="event-share-card__copy">
      <p class="eyebrow">Convite do evento</p>
      <h2>Compartilhe a confirmação</h2>
      <p>As pessoas podem apontar a câmera do celular ou acessar o link para confirmar presença.</p>
      <label class="event-share-card__url">
        <span>Link público</span>
        <input :value="publicUrl" readonly @focus="($event.target as HTMLInputElement).select()">
      </label>
      <div class="event-share-card__actions">
        <a class="button button--primary" :href="publicUrl" target="_blank" rel="noopener noreferrer">Abrir página ↗</a>
        <button class="button" type="button" @click="copyLink">Copiar link</button>
        <button class="button" type="button" :disabled="!qrImage" @click="downloadQrCode">Baixar QR Code</button>
      </div>
      <p v-if="feedback" class="event-share-card__feedback" role="status">{{ feedback }}</p>
    </div>
    <figure class="event-share-card__qr">
      <img v-if="qrImage" :src="qrImage" :alt="`QR Code para confirmar presença em ${title}`">
      <span v-else>Gerando QR Code…</span>
      <figcaption>Aponte a câmera para testar</figcaption>
    </figure>
  </article>
</template>

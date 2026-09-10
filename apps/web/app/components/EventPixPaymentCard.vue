<script setup lang="ts">
import QRCode from 'qrcode';
import { buildStaticPixPayload, pixTransactionId } from '~/utils/pix-br-code';

const props = defineProps<{
  modelValue: boolean;
  pix: { key: string; recipientName: string; city: string };
  amountCents: number;
  publicEventId: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const qrImage = ref('');
const feedback = ref('');
const price = computed(() => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(props.amountCents / 100));
const copyPaste = computed(() => buildStaticPixPayload({
  key: props.pix.key,
  recipientName: props.pix.recipientName,
  city: props.pix.city,
  amountCents: props.amountCents,
  transactionId: pixTransactionId(props.publicEventId),
}));

async function generateQrCode() {
  if (!import.meta.client) return;
  feedback.value = '';
  try {
    qrImage.value = await QRCode.toDataURL(copyPaste.value, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#102B24', light: '#FFFFFF' },
    });
  } catch {
    qrImage.value = '';
    feedback.value = 'Não foi possível gerar o QR Code neste navegador.';
  }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(copyPaste.value);
    feedback.value = 'Código Pix copiado.';
  } catch {
    feedback.value = 'Não foi possível copiar. Selecione o código abaixo.';
  }
}

onMounted(generateQrCode);
watch(copyPaste, generateQrCode);
</script>

<template>
  <section class="pix-payment-card" aria-labelledby="pix-payment-title">
    <header>
      <div><p class="eyebrow">Pagamento dos adicionais</p><h3 id="pix-payment-title">Pague {{ price }} por PIX</h3><p>O valor corresponde às opções pagas selecionadas acima.</p></div>
      <strong>{{ price }}</strong>
    </header>
    <div class="pix-payment-card__content">
      <figure><img v-if="qrImage" :src="qrImage" alt="QR Code PIX para pagar os adicionais selecionados"><span v-else>Gerando QR Code…</span></figure>
      <div>
        <strong>{{ pix.recipientName }}</strong>
        <small>Chave PIX: {{ pix.key }}</small>
        <label class="pix-copy-code"><span>Pix Copia e Cola</span><textarea :value="copyPaste" rows="3" readonly @focus="($event.target as HTMLTextAreaElement).select()" /></label>
        <button class="button button--small" type="button" @click="copyCode">Copiar código PIX</button>
        <p v-if="feedback" class="pix-payment-card__feedback" role="status">{{ feedback }}</p>
      </div>
    </div>
    <label class="pix-payment-declaration">
      <input :checked="modelValue" type="checkbox" required @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
      <span><strong>Já efetuei o PIX</strong><small>Esta marcação informa a comunidade, mas não substitui a confirmação do recebimento pelo banco.</small></span>
    </label>
  </section>
</template>

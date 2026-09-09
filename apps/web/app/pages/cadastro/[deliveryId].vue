<script setup lang="ts">
definePageMeta({ layout: 'login' });
useHead({ title: 'Atualizar cadastro' });
interface PublicOnboarding { member: { name: string; email: string }; phone: string; expiresAt: string }

const route = useRoute();
const api = useApi();
const deliveryId = computed(() => String(route.params.deliveryId));
const token = computed(() => {
  try {
    return decodeURIComponent(route.hash.replace(/^#/, ''));
  } catch {
    return '';
  }
});
const { data: onboarding, pending, error } = await useAsyncData(
  `member-onboarding-${deliveryId.value}`,
  () => api<PublicOnboarding>(`/public/member-onboarding/${deliveryId.value}/resolve`, { method: 'POST', body: { token: token.value } }),
  { server: false },
);
const form = reactive({
  password: '', phone: '', birthDate: '', spouseName: '', marriageDate: '', whatsappCommunicationOptIn: false,
  address: { postalCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' },
  children: [] as Array<{ name: string; birthDate: string }>,
});
const showPassword = ref(false);
const saving = ref(false);
const completed = ref(false);
const errorMessage = ref('');
const today = new Date().toISOString().slice(0, 10);
watch(onboarding, (value) => { if (value && !form.phone) form.phone = value.phone; }, { immediate: true });
function addChild() { form.children.push({ name: '', birthDate: '' }); }
async function submit() {
  saving.value = true; errorMessage.value = '';
  try {
    await api(`/public/member-onboarding/${deliveryId.value}`, { method: 'PUT', body: {
      token: token.value, password: form.password, phone: form.phone,
      birthDate: form.birthDate || undefined, spouseName: form.spouseName || undefined,
      marriageDate: form.marriageDate || undefined,
      whatsappCommunicationOptIn: form.whatsappCommunicationOptIn,
      address: Object.fromEntries(Object.entries(form.address).map(([key, value]) => [key, value.trim() || undefined])),
      children: form.children.map((child) => ({ name: child.name, birthDate: child.birthDate || undefined })),
    } });
    completed.value = true;
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    errorMessage.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível concluir o cadastro.';
  } finally { saving.value = false; }
}
</script>

<template>
  <main class="onboarding-public">
    <section class="onboarding-brand"><AppLogo light /><div><p class="eyebrow eyebrow--light">Bem-vindo à comunidade</p><h1>Seus dados, uma única vez.</h1><p>Revise seu cadastro para não precisar informar as mesmas informações em cada novo evento.</p></div><small>Este link é pessoal. Não encaminhe para outras pessoas.</small></section>
    <section class="onboarding-panel">
      <div v-if="pending" class="onboarding-state">Validando seu convite…</div>
      <div v-else-if="error || !onboarding" class="onboarding-state"><span>!</span><h2>Link indisponível</h2><p>Ele pode ter expirado, já ter sido usado ou ter sido revogado. Peça uma nova entrega ao responsável da comunidade.</p></div>
      <div v-else-if="completed" class="onboarding-state onboarding-state--success"><span>✓</span><h2>Cadastro atualizado</h2><p>Sua nova senha já está ativa. Você pode usar o mesmo e-mail nos próximos convites de evento.</p></div>
      <form v-else class="onboarding-form" @submit.prevent="submit">
        <header><p class="eyebrow">Atualização cadastral</p><h2>Olá, {{ onboarding.member.name }}</h2><p>Confira as informações e complete somente o que desejar.</p></header>
        <section><h3>Acesso</h3><div class="form-grid"><label class="field"><span>E-mail</span><input :value="onboarding.member.email" disabled></label><label class="field"><span>WhatsApp <b>*</b></span><input v-model="form.phone" minlength="8" maxlength="32" required></label><label class="field field--wide"><span>Escolha uma nova senha <b>*</b></span><span class="password-wrap"><input v-model="form.password" :type="showPassword ? 'text' : 'password'" minlength="10" autocomplete="new-password" required><button type="button" @click="showPassword = !showPassword">{{ showPassword ? 'Ocultar' : 'Mostrar' }}</button></span><small>Use ao menos 10 caracteres. Uma frase fácil de lembrar funciona bem.</small></label></div></section>
        <section><h3>Sobre você</h3><div class="form-grid"><label class="field"><span>Data de nascimento</span><input v-model="form.birthDate" type="date" :max="today"></label><label class="field"><span>Nome do cônjuge</span><input v-model="form.spouseName" minlength="2" maxlength="120"></label><label class="field"><span>Data de casamento</span><input v-model="form.marriageDate" type="date" :max="today"></label></div></section>
        <section><h3>Endereço</h3><div class="form-grid"><label class="field"><span>CEP</span><input v-model="form.address.postalCode" maxlength="16"></label><label class="field field--wide"><span>Logradouro</span><input v-model="form.address.street" maxlength="160"></label><label class="field"><span>Número</span><input v-model="form.address.number" maxlength="32"></label><label class="field"><span>Complemento</span><input v-model="form.address.complement" maxlength="120"></label><label class="field"><span>Bairro</span><input v-model="form.address.neighborhood" maxlength="120"></label><label class="field"><span>Cidade</span><input v-model="form.address.city" maxlength="120"></label><label class="field"><span>Estado</span><input v-model="form.address.state" maxlength="2" pattern="[A-Za-z]{2}" placeholder="SP"></label></div></section>
        <section><div class="onboarding-section-heading"><h3>Filhos</h3><button class="button button--small" type="button" @click="addChild">＋ Adicionar</button></div><p v-if="!form.children.length" class="form-hint">Opcional. Você pode deixar esta parte em branco.</p><div v-for="(child, index) in form.children" :key="index" class="member-child-editor"><label class="field"><span>Nome</span><input v-model="child.name" minlength="2" maxlength="120" required></label><label class="field"><span>Data de nascimento</span><input v-model="child.birthDate" type="date" :max="today"></label><button type="button" class="remove" @click="form.children.splice(index, 1)">×</button></div></section>
        <label class="communication-consent"><input v-model="form.whatsappCommunicationOptIn" type="checkbox"><span><strong>Autorizo a comunidade a iniciar conversas comigo pelo WhatsApp</strong><small>Você pode não autorizar agora. Informar o número não ativa esta opção automaticamente.</small></span></label>
        <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>
        <footer><small>Ao concluir, este link e a senha temporária serão inutilizados.</small><button class="button button--primary button--large" :disabled="saving">{{ saving ? 'Salvando…' : 'Concluir meu cadastro' }}</button></footer>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
type PaymentEnvironment = 'sandbox' | 'production';
interface ProviderSettings { enabled: boolean; clientId: string; secretReference: string }
interface CommunitySettings {
  socialLogin: { google: ProviderSettings; microsoft: ProviderSettings };
  payments: {
    pix: { enabled: boolean; keyType: PixKeyType; key: string; recipientName: string; city: string };
    gateway: {
      enabled: boolean;
      providerKey: string;
      environment: PaymentEnvironment;
      publicIdentifier: string;
      secretReference: string;
    };
  };
}

useHead({ title: 'Configurações' });
const api = useApi();
const auth = useAuth();
const canManage = computed(() => auth.session.value?.user.permissions.includes('settings.manage'));
const canManageSessions = computed(() => auth.session.value?.user.permissions.includes('sessions.manage'));
const { data, pending, error, refresh } = await useAsyncData('community-settings', () => api<CommunitySettings>('/settings'), { server: false });
const form = reactive<CommunitySettings>({
  socialLogin: {
    google: { enabled: false, clientId: '', secretReference: '' },
    microsoft: { enabled: false, clientId: '', secretReference: '' },
  },
  payments: {
    pix: { enabled: false, keyType: 'random', key: '', recipientName: '', city: '' },
    gateway: { enabled: false, providerKey: '', environment: 'sandbox', publicIdentifier: '', secretReference: '' },
  },
});
const hydrated = ref(false);
const saving = ref(false);
const feedback = ref<{ type: 'success' | 'error'; message: string } | null>(null);
interface AuthSession { id: string; createdAt: string; expiresAt: string; current: boolean }
const { data: sessions, refresh: refreshSessions } = await useAsyncData('auth-sessions', () => canManageSessions.value ? api<AuthSession[]>('/sessions') : Promise.resolve([]), { server: false });
const sessionFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

async function revokeOtherSessions() {
  feedback.value = null;
  try {
    const result = await api<{ revoked: number }>('/sessions/others', { method: 'DELETE' });
    await refreshSessions();
    feedback.value = { type: 'success', message: `${result.revoked} outra(s) sessão(ões) encerrada(s).` };
  } catch (requestError: any) {
    feedback.value = { type: 'error', message: requestError?.data?.message ?? 'Não foi possível encerrar as sessões.' };
  }
}

watch(data, (settings) => {
  if (!settings || hydrated.value) return;
  Object.assign(form.socialLogin.google, settings.socialLogin.google);
  Object.assign(form.socialLogin.microsoft, settings.socialLogin.microsoft);
  Object.assign(form.payments.pix, settings.payments.pix);
  Object.assign(form.payments.gateway, settings.payments.gateway);
  hydrated.value = true;
}, { immediate: true });

async function save() {
  if (!canManage.value) return;
  saving.value = true;
  feedback.value = null;
  try {
    const saved = await api<CommunitySettings>('/settings', { method: 'PUT', body: form });
    data.value = saved;
    feedback.value = { type: 'success', message: 'Configurações salvas.' };
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    feedback.value = {
      type: 'error',
      message: Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível salvar as configurações.',
    };
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page page--settings">
    <header class="page-header"><div><p class="eyebrow">Administração</p><h1>Configurações</h1><p class="muted">Defina integrações da comunidade sem expor credenciais privadas.</p></div></header>

    <div v-if="pending" class="empty-card settings-loading">Carregando configurações…</div>
    <div v-else-if="error" class="empty-card settings-loading"><p>Não foi possível carregar as configurações.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
    <form v-else class="settings-form" @submit.prevent="save">
      <section class="settings-section">
        <div class="settings-section__heading"><span class="settings-icon">◎</span><div><p class="eyebrow">Inscrição sem atrito</p><h2>Login social dos membros</h2><p>Habilite provedores para o membro entrar pelo convite do evento e continuar a confirmação de presença. O botão público só aparece quando o adaptador OIDC estiver instalado.</p></div></div>

        <div class="integration-grid">
          <article class="integration-card">
            <header><span class="provider-mark provider-mark--google">G</span><div><h3>Google</h3><small>OpenID Connect</small></div><label class="switch"><input v-model="form.socialLogin.google.enabled" type="checkbox" :disabled="!canManage"><span /><b>{{ form.socialLogin.google.enabled ? 'Ativado' : 'Desativado' }}</b></label></header>
            <div class="integration-fields">
              <label class="field"><span>Client ID</span><input v-model="form.socialLogin.google.clientId" :disabled="!canManage" placeholder="ID público do cliente"></label>
              <label class="field"><span>Variável com o Client Secret</span><input v-model="form.socialLogin.google.secretReference" :disabled="!canManage" placeholder="GOOGLE_OIDC_CLIENT_SECRET"><small>Informe somente o nome da variável, nunca o segredo.</small></label>
            </div>
          </article>

          <article class="integration-card">
            <header><span class="provider-mark provider-mark--microsoft">M</span><div><h3>Microsoft</h3><small>OpenID Connect</small></div><label class="switch"><input v-model="form.socialLogin.microsoft.enabled" type="checkbox" :disabled="!canManage"><span /><b>{{ form.socialLogin.microsoft.enabled ? 'Ativado' : 'Desativado' }}</b></label></header>
            <div class="integration-fields">
              <label class="field"><span>Client ID</span><input v-model="form.socialLogin.microsoft.clientId" :disabled="!canManage" placeholder="ID público do aplicativo"></label>
              <label class="field"><span>Variável com o Client Secret</span><input v-model="form.socialLogin.microsoft.secretReference" :disabled="!canManage" placeholder="MICROSOFT_OIDC_CLIENT_SECRET"><small>Informe somente o nome da variável, nunca o segredo.</small></label>
            </div>
          </article>
        </div>
      </section>

      <section v-if="canManageSessions" class="settings-section">
        <div class="settings-section__heading"><span class="settings-icon">⌾</span><div><p class="eyebrow">Segurança</p><h2>Sessões e autenticação forte</h2><p>Tokens agora pertencem a sessões revogáveis. MFA permanece desativado até que uma política e um adaptador seguro sejam configurados.</p></div></div>
        <div class="integration-grid">
          <article class="integration-card"><header><span class="provider-mark">{{ sessions?.length ?? 0 }}</span><div><h3>Sessões ativas</h3><small>A sessão atual é preservada</small></div></header><div class="integration-fields"><p v-for="session in sessions" :key="session.id" class="session-row"><span><strong>{{ session.current ? 'Sessão atual' : 'Outra sessão' }}</strong><small>Iniciada em {{ sessionFormatter.format(new Date(session.createdAt)) }}</small></span><span class="badge" :class="session.current ? 'badge--published' : 'badge--draft'">{{ session.current ? 'Atual' : 'Ativa' }}</span></p><button type="button" class="button button--danger" :disabled="(sessions?.length ?? 0) < 2" @click="revokeOtherSessions">Encerrar outras sessões</button></div></article>
          <article class="integration-card"><header><span class="provider-mark">2×</span><div><h3>Autenticação multifator</h3><small>Porta preparada, provedor ainda não instalado</small></div></header><p class="integration-warning"><strong>Antes de ativar:</strong> a comunidade precisa definir TOTP ou passkey, códigos de recuperação e o fluxo de emergência auditado. O sistema não simula proteção inexistente.</p></article>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section__heading"><span class="settings-icon">◇</span><div><p class="eyebrow">Recebimentos</p><h2>PIX</h2><p>Dados para PIX manual. Vincular cobrança a eventos será uma etapa separada.</p></div><label class="switch"><input v-model="form.payments.pix.enabled" type="checkbox" :disabled="!canManage"><span /><b>{{ form.payments.pix.enabled ? 'Ativado' : 'Desativado' }}</b></label></div>
        <div class="form-grid settings-fields">
          <label class="field"><span>Tipo de chave</span><select v-model="form.payments.pix.keyType" :disabled="!canManage"><option value="random">Aleatória</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option></select></label>
          <label class="field"><span>Chave PIX</span><input v-model="form.payments.pix.key" :disabled="!canManage" maxlength="160" placeholder="Chave do recebedor"></label>
          <label class="field"><span>Nome do recebedor</span><input v-model="form.payments.pix.recipientName" :disabled="!canManage" maxlength="120"></label>
          <label class="field"><span>Cidade</span><input v-model="form.payments.pix.city" :disabled="!canManage" maxlength="80"></label>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section__heading"><span class="settings-icon">↔</span><div><p class="eyebrow">Adaptadores</p><h2>Gateway de pagamento</h2><p>Use uma chave estável para conectar qualquer implementação da porta <code>PaymentGateway</code>.</p></div><label class="switch"><input v-model="form.payments.gateway.enabled" type="checkbox" :disabled="!canManage"><span /><b>{{ form.payments.gateway.enabled ? 'Ativado' : 'Desativado' }}</b></label></div>
        <div class="form-grid settings-fields">
          <label class="field"><span>Chave do adaptador</span><input v-model="form.payments.gateway.providerKey" :disabled="!canManage" placeholder="ex.: meu_gateway"></label>
          <label class="field"><span>Ambiente</span><select v-model="form.payments.gateway.environment" :disabled="!canManage"><option value="sandbox">Sandbox / testes</option><option value="production">Produção</option></select></label>
          <label class="field"><span>Identificador público</span><input v-model="form.payments.gateway.publicIdentifier" :disabled="!canManage" placeholder="ID público da conta ou aplicação"></label>
          <label class="field"><span>Variável com a credencial privada</span><input v-model="form.payments.gateway.secretReference" :disabled="!canManage" placeholder="PAYMENT_GATEWAY_SECRET"><small>Tokens e chaves privadas ficam no secret manager da implantação.</small></label>
        </div>
        <p class="integration-warning"><strong>Fundação de configuração:</strong> nenhuma cobrança será criada até que um adaptador compatível seja instalado e associado às regras do evento.</p>
      </section>

      <footer class="settings-actions"><p v-if="feedback" :class="feedback.type === 'error' ? 'alert' : 'success-note'" role="status">{{ feedback.message }}</p><span v-else class="muted">Alterações afetam somente esta comunidade.</span><button v-if="canManage" class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar configurações' }}</button></footer>
    </form>
  </div>
</template>

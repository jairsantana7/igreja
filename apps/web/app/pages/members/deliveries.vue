<script setup lang="ts">
interface Delivery {
  id: string;
  member: { id: string; name: string; email: string };
  phone: string;
  status: 'pending' | 'revealed' | 'delivered' | 'completed' | 'revoked' | 'expired';
  expiresAt: string;
  revealedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
interface RevealedSecret { temporaryPassword: string; registrationPath: string }

useHead({ title: 'Entregas de acesso' });
const api = useApi();
const auth = useAuth();
const canManage = computed(() => auth.session.value?.user.permissions.includes('members.credentials_manage'));
const { data: deliveries, pending, error, refresh } = await useAsyncData(
  'member-onboarding-deliveries',
  () => canManage.value ? api<Delivery[]>('/members/onboarding-deliveries') : Promise.resolve([]),
  { server: false },
);
const revealed = reactive<Record<string, RevealedSecret>>({});
const busyId = ref<string | null>(null);
const feedback = ref('');
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const statusLabels: Record<Delivery['status'], string> = {
  pending: 'Aguardando envio', revealed: 'Credencial consultada', delivered: 'Enviada',
  completed: 'Cadastro concluído', revoked: 'Revogada', expired: 'Expirada',
};

function fullRegistrationUrl(path: string) {
  return import.meta.client ? `${window.location.origin}${path}` : path;
}

function preparedMessage(delivery: Delivery, secret: RevealedSecret) {
  return `Olá, ${delivery.member.name}! Seu acesso à comunidade foi preparado.\n\nE-mail: ${delivery.member.email}\nSenha temporária: ${secret.temporaryPassword}\n\nComplete ou atualize seu cadastro e escolha uma nova senha aqui:\n${fullRegistrationUrl(secret.registrationPath)}\n\nEste link é pessoal e expira em ${dateFormatter.format(new Date(delivery.expiresAt))}.`;
}

async function reveal(delivery: Delivery) {
  busyId.value = delivery.id; feedback.value = '';
  try {
    revealed[delivery.id] = await api<RevealedSecret>(`/members/onboarding-deliveries/${delivery.id}/reveal`, { method: 'POST' });
    await refresh();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível abrir esta entrega.';
  } finally { busyId.value = null; }
}

async function copyDelivery(delivery: Delivery) {
  const secret = revealed[delivery.id];
  if (!secret) return;
  try {
    await navigator.clipboard.writeText(preparedMessage(delivery, secret));
    feedback.value = 'Mensagem copiada. Envie pelo canal combinado com o membro.';
  } catch { feedback.value = 'O navegador não permitiu copiar a mensagem.'; }
}

async function markDelivered(delivery: Delivery) {
  busyId.value = delivery.id; feedback.value = '';
  try {
    await api(`/members/onboarding-deliveries/${delivery.id}/delivered`, { method: 'PUT' });
    delete revealed[delivery.id];
    feedback.value = 'Entrega marcada como enviada.';
    await refresh();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível atualizar a entrega.';
  } finally { busyId.value = null; }
}

async function revoke(delivery: Delivery) {
  if (!confirm(`Revogar o acesso temporário de ${delivery.member.name}?`)) return;
  busyId.value = delivery.id; feedback.value = '';
  try {
    await api(`/members/onboarding-deliveries/${delivery.id}`, { method: 'DELETE' });
    delete revealed[delivery.id];
    feedback.value = 'Entrega revogada e segredo removido.';
    await refresh();
  } catch (requestError: any) {
    feedback.value = requestError?.data?.message ?? 'Não foi possível revogar a entrega.';
  } finally { busyId.value = null; }
}
</script>

<template>
  <div class="page page--deliveries">
    <header class="page-header"><div><NuxtLink to="/members" class="back-link">← Voltar para membros</NuxtLink><p class="eyebrow">Cadastro seguro</p><h1>Entregas de acesso</h1><p class="muted">Copie a mensagem pronta e envie manualmente. Senhas e links não aparecem na listagem.</p></div><NuxtLink to="/members/new" class="button button--primary">＋ Novo membro</NuxtLink></header>
    <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
    <div v-if="!canManage" class="empty-card">Você não tem permissão para administrar credenciais temporárias.</div>
    <div v-else-if="pending" class="empty-card">Carregando entregas…</div>
    <div v-else-if="error" class="empty-card"><p>Não foi possível carregar a fila.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
    <div v-else-if="!deliveries?.length" class="empty-card"><span class="empty-icon">✉</span><h3>Nenhuma entrega preparada</h3><p>Cadastre um membro para gerar o primeiro acesso.</p></div>
    <section v-else class="delivery-list">
      <article v-for="delivery in deliveries" :key="delivery.id" class="delivery-card">
        <header><span class="member-avatar">{{ delivery.member.name.charAt(0).toUpperCase() }}</span><div><h2>{{ delivery.member.name }}</h2><p>{{ delivery.phone }} · {{ delivery.member.email }}</p></div><span class="status-badge" :class="`delivery-status--${delivery.status}`">{{ statusLabels[delivery.status] }}</span></header>
        <div class="delivery-meta"><span>Criada em {{ dateFormatter.format(new Date(delivery.createdAt)) }}</span><span>Expira em {{ dateFormatter.format(new Date(delivery.expiresAt)) }}</span></div>
        <div v-if="revealed[delivery.id]" class="delivery-secret">
          <div><small>Senha temporária</small><strong>{{ revealed[delivery.id]!.temporaryPassword }}</strong></div>
          <textarea readonly :value="preparedMessage(delivery, revealed[delivery.id]!)" aria-label="Mensagem pronta para envio" />
          <p>O conteúdo fica somente nesta tela e não é salvo no navegador.</p>
        </div>
        <footer v-if="['pending', 'revealed', 'delivered'].includes(delivery.status)">
          <button v-if="!revealed[delivery.id]" class="button" :disabled="busyId === delivery.id || delivery.status === 'expired'" @click="reveal(delivery)">Ver dados para envio</button>
          <button v-else class="button button--primary" @click="copyDelivery(delivery)">Copiar mensagem</button>
          <button class="button" :disabled="busyId === delivery.id || delivery.status === 'expired'" @click="markDelivered(delivery)">✓ Marcar como enviada</button>
          <button class="button button--danger" :disabled="busyId === delivery.id" @click="revoke(delivery)">Revogar</button>
        </footer>
      </article>
    </section>
  </div>
</template>

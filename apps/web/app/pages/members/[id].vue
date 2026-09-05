<script setup lang="ts">
interface MemberProfile {
  member: { id: string; name: string; email: string };
  birthDate: string | null;
  address: { postalCode: string | null; street: string | null; number: string | null; complement: string | null; neighborhood: string | null; city: string | null; state: string | null };
  hasChildren: boolean;
  children: Array<{ id: string; name: string; birthDate: string | null }>;
  updatedAt: string | null;
}

useHead({ title: 'Perfil do membro' });
const api = useApi();
const auth = useAuth();
const route = useRoute();
const memberId = String(route.params.id);
const canManage = computed(() => auth.session.value?.user.permissions.includes('members.profile_manage'));
const { data: profile, pending, error, refresh } = await useAsyncData(`member-profile-${memberId}`, () => api<MemberProfile>(`/members/${memberId}/profile`), { server: false });
const form = reactive({
  birthDate: '',
  address: { postalCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' },
  children: [] as Array<{ name: string; birthDate: string }>,
});
const editing = ref(false);
const saving = ref(false);
const feedback = ref('');
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
const today = new Date().toISOString().slice(0, 10);

function loadForm() {
  if (!profile.value) return;
  form.birthDate = profile.value.birthDate ?? '';
  Object.assign(form.address, Object.fromEntries(Object.entries(profile.value.address).map(([key, value]) => [key, value ?? ''])));
  form.children = profile.value.children.map((child) => ({ name: child.name, birthDate: child.birthDate ?? '' }));
}
watch(profile, loadForm, { immediate: true });
function addChild() { form.children.push({ name: '', birthDate: '' }); }

async function save() {
  saving.value = true; feedback.value = '';
  try {
    await api(`/members/${memberId}/profile`, { method: 'PUT', body: {
      birthDate: form.birthDate || undefined,
      address: Object.fromEntries(Object.entries(form.address).map(([key, value]) => [key, value.trim() || undefined])),
      children: form.children.map((child) => ({ name: child.name, birthDate: child.birthDate || undefined })),
    } });
    await refresh();
    editing.value = false;
    feedback.value = 'Perfil complementar atualizado.';
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    feedback.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível atualizar o perfil.';
  } finally { saving.value = false; }
}
</script>

<template>
  <div class="page page--member-profile">
    <div v-if="pending" class="empty-card">Carregando perfil…</div>
    <div v-else-if="error || !profile" class="empty-card"><p>Não foi possível carregar este perfil.</p><NuxtLink to="/members" class="button">Voltar para membros</NuxtLink></div>
    <template v-else>
      <header class="page-header"><div><NuxtLink to="/members" class="back-link">← Todos os membros</NuxtLink><p class="eyebrow">Perfil complementar</p><h1>{{ profile.member.name }}</h1><p class="muted">{{ profile.member.email }}</p></div><button v-if="canManage && !editing" class="button button--primary" @click="editing = true; loadForm()">✎ Editar perfil</button></header>
      <p v-if="feedback" class="operation-feedback" role="status">{{ feedback }}</p>
      <p class="member-privacy-note"><strong>Dados pessoais:</strong> use estas informações somente para cuidado e relacionamento com a comunidade. Elas não aparecem na listagem geral nem na auditoria.</p>

      <form v-if="editing" class="member-profile-form" @submit.prevent="save">
        <section class="editor-card"><div class="editor-card__heading"><span>♙</span><div><h2>Dados pessoais</h2><p>Todos os campos são opcionais.</p></div></div><div class="form-grid"><label class="field"><span>Data de nascimento</span><input v-model="form.birthDate" type="date" :max="today" autocomplete="bday"></label></div></section>
        <section class="editor-card"><div class="editor-card__heading"><span>⌂</span><div><h2>Endereço</h2><p>Todos os campos são opcionais.</p></div></div><div class="form-grid"><label class="field"><span>CEP</span><input v-model="form.address.postalCode" maxlength="16"></label><label class="field"><span>Logradouro</span><input v-model="form.address.street" maxlength="160"></label><label class="field"><span>Número</span><input v-model="form.address.number" maxlength="32"></label><label class="field"><span>Complemento</span><input v-model="form.address.complement" maxlength="120"></label><label class="field"><span>Bairro</span><input v-model="form.address.neighborhood" maxlength="120"></label><label class="field"><span>Cidade</span><input v-model="form.address.city" maxlength="120"></label><label class="field"><span>Estado</span><input v-model="form.address.state" maxlength="2" pattern="[A-Za-z]{2}" placeholder="SP"></label></div></section>
        <section class="editor-card"><div class="editor-card__heading"><span>♙</span><div><h2>Filhos</h2><p>Cadastre somente o necessário. A data de nascimento é opcional.</p></div><button type="button" class="button button--small" @click="addChild">＋ Adicionar</button></div><div v-if="!form.children.length" class="form-empty">Nenhum filho informado.</div><div v-for="(child, index) in form.children" :key="index" class="member-child-editor"><label class="field"><span>Nome</span><input v-model="child.name" minlength="2" maxlength="120" required></label><label class="field"><span>Data de nascimento</span><input v-model="child.birthDate" type="date" :max="new Date().toISOString().slice(0, 10)"></label><button type="button" class="remove" :aria-label="`Remover ${child.name || 'filho'}`" @click="form.children.splice(index, 1)">×</button></div></section>
        <footer class="editor-actions"><p class="muted">O perfil não é obrigatório para participação em eventos.</p><div><button type="button" class="button" @click="editing = false; loadForm()">Cancelar</button><button class="button button--primary" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar perfil' }}</button></div></footer>
      </form>

      <div v-else class="member-profile-grid">
        <section class="operation-card"><p class="eyebrow">Dados pessoais</p><h2>{{ profile.birthDate ? formatter.format(new Date(`${profile.birthDate}T00:00:00`)) : 'Nascimento não informado' }}</h2></section>
        <section class="operation-card"><p class="eyebrow">Endereço</p><h2>{{ profile.address.street ? `${profile.address.street}${profile.address.number ? `, ${profile.address.number}` : ''}` : 'Não informado' }}</h2><p v-if="profile.address.complement">{{ profile.address.complement }}</p><p v-if="profile.address.neighborhood">{{ profile.address.neighborhood }}</p><p v-if="profile.address.city || profile.address.state">{{ [profile.address.city, profile.address.state].filter(Boolean).join(' · ') }}</p><p v-if="profile.address.postalCode">CEP {{ profile.address.postalCode }}</p></section>
        <section class="operation-card"><p class="eyebrow">Família</p><h2>{{ profile.hasChildren ? `${profile.children.length} ${profile.children.length === 1 ? 'filho informado' : 'filhos informados'}` : 'Nenhum filho informado' }}</h2><div v-if="profile.children.length" class="member-children-list"><article v-for="child in profile.children" :key="child.id"><span class="member-avatar">{{ child.name.charAt(0).toUpperCase() }}</span><div><strong>{{ child.name }}</strong><small>{{ child.birthDate ? `Nascimento: ${formatter.format(new Date(`${child.birthDate}T00:00:00`))}` : 'Nascimento não informado' }}</small></div></article></div></section>
      </div>
    </template>
  </div>
</template>

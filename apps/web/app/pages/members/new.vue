<script setup lang="ts">
interface RoleOption { id: string; name: string; key: string }
interface AccessView { roles: RoleOption[] }

useHead({ title: 'Novo membro' });
const api = useApi();
const auth = useAuth();
const canCreate = computed(() => auth.session.value?.user.permissions.includes('users.create')
  && auth.session.value?.user.permissions.includes('roles.read'));
const canManageProfile = computed(() => auth.session.value?.user.permissions.includes('members.profile_manage'));
const { data: access, pending, error } = await useAsyncData('member-role-options', () => api<AccessView>('/access'), { server: false });
const form = reactive({
  name: '',
  email: '',
  password: '',
  roleIds: [] as string[],
  birthDate: '',
  address: { postalCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' },
  children: [] as Array<{ name: string; birthDate: string }>,
});
const saving = ref(false);
const errorMessage = ref('');
const today = new Date().toISOString().slice(0, 10);

function addChild() { form.children.push({ name: '', birthDate: '' }); }

function optionalProfile() {
  if (!canManageProfile.value) return undefined;
  const address = Object.fromEntries(Object.entries(form.address).map(([key, value]) => [key, value.trim() || undefined]));
  const hasAddress = Object.values(address).some(Boolean);
  if (!form.birthDate && !hasAddress && !form.children.length) return undefined;
  return {
    birthDate: form.birthDate || undefined,
    address,
    children: form.children.map((child) => ({ name: child.name, birthDate: child.birthDate || undefined })),
  };
}

async function submit() {
  if (!canCreate.value) return;
  saving.value = true;
  errorMessage.value = '';
  try {
    await api('/access/users', { method: 'POST', body: {
      name: form.name,
      email: form.email,
      password: form.password,
      roleIds: form.roleIds,
      profile: optionalProfile(),
    } });
    await refreshNuxtData('members');
    await navigateTo('/members');
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    errorMessage.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível cadastrar o membro.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page page--narrow">
    <header class="page-header"><div><NuxtLink to="/members" class="back-link">← Voltar para membros</NuxtLink><p class="eyebrow">Comunidade</p><h1>Novo membro</h1><p class="muted">Cadastre uma pessoa e escolha seus papéis de acesso.</p></div></header>

    <div v-if="pending" class="empty-card">Carregando papéis…</div>
    <div v-else-if="error" class="empty-card"><p>Não foi possível carregar os papéis disponíveis.</p><NuxtLink to="/members" class="button">Voltar</NuxtLink></div>
    <div v-else-if="!canCreate" class="empty-card"><p>Você não tem permissão para cadastrar membros.</p><NuxtLink to="/members" class="button">Voltar</NuxtLink></div>
    <form v-else class="editor" @submit.prevent="submit">
      <section class="editor-card">
        <div class="editor-card__heading"><span>1</span><div><h2>Dados de acesso</h2><p>Informe os dados que a pessoa usará para entrar.</p></div></div>
        <div class="form-grid">
          <label class="field field--wide"><span>Nome completo <b>*</b></span><input v-model="form.name" autocomplete="name" minlength="2" maxlength="120" required></label>
          <label class="field"><span>E-mail <b>*</b></span><input v-model="form.email" type="email" autocomplete="email" required></label>
          <label class="field"><span>Senha inicial <b>*</b></span><input v-model="form.password" type="password" autocomplete="new-password" minlength="10" required><small>A senha precisa ter pelo menos 10 caracteres.</small></label>
        </div>
      </section>

      <section v-if="canManageProfile" class="editor-card">
        <div class="editor-card__heading"><span>2</span><div><h2>Perfil complementar</h2><p>Essas informações são opcionais e não impedem o cadastro.</p></div></div>
        <div class="form-grid">
          <label class="field"><span>Data de nascimento</span><input v-model="form.birthDate" type="date" :max="today" autocomplete="bday"></label>
          <label class="field"><span>CEP</span><input v-model="form.address.postalCode" maxlength="16" autocomplete="postal-code"></label>
          <label class="field"><span>Logradouro</span><input v-model="form.address.street" maxlength="160" autocomplete="street-address"></label>
          <label class="field"><span>Número</span><input v-model="form.address.number" maxlength="32"></label>
          <label class="field"><span>Complemento</span><input v-model="form.address.complement" maxlength="120"></label>
          <label class="field"><span>Bairro</span><input v-model="form.address.neighborhood" maxlength="120"></label>
          <label class="field"><span>Cidade</span><input v-model="form.address.city" maxlength="120" autocomplete="address-level2"></label>
          <label class="field"><span>Estado</span><input v-model="form.address.state" maxlength="2" pattern="[A-Za-z]{2}" placeholder="SP" autocomplete="address-level1"></label>
        </div>
        <div class="member-onboarding-children">
          <div class="editor-card__heading"><span>♙</span><div><h3>Filhos</h3><p>Nome e data de nascimento também são opcionais.</p></div><button type="button" class="button button--small" @click="addChild">＋ Adicionar</button></div>
          <div v-if="!form.children.length" class="form-empty">Nenhum filho informado.</div>
          <div v-for="(child, index) in form.children" :key="index" class="member-child-editor">
            <label class="field"><span>Nome</span><input v-model="child.name" minlength="2" maxlength="120" required></label>
            <label class="field"><span>Data de nascimento</span><input v-model="child.birthDate" type="date" :max="today"></label>
            <button type="button" class="remove" :aria-label="`Remover ${child.name || 'filho'}`" @click="form.children.splice(index, 1)">×</button>
          </div>
        </div>
      </section>

      <section class="editor-card">
        <div class="editor-card__heading"><span>{{ canManageProfile ? 3 : 2 }}</span><div><h2>Papéis</h2><p>Os papéis agrupam as permissões desta pessoa.</p></div></div>
        <div class="role-options">
          <label v-for="item in access?.roles" :key="item.id" class="role-option"><input v-model="form.roleIds" type="checkbox" :value="item.id"><span><strong>{{ item.name }}</strong><small>{{ item.key }}</small></span></label>
        </div>
        <p v-if="!form.roleIds.length" class="form-hint">Selecione pelo menos um papel.</p>
      </section>

      <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>
      <footer class="editor-actions"><span class="muted">A pessoa poderá entrar assim que o cadastro for concluído.</span><div><NuxtLink to="/members" class="button">Cancelar</NuxtLink><button class="button button--primary" type="submit" :disabled="saving || !form.roleIds.length">{{ saving ? 'Cadastrando…' : 'Cadastrar membro' }}</button></div></footer>
    </form>
  </div>
</template>

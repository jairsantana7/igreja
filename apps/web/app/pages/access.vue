<script setup lang="ts">
interface PermissionOption { key: string; description: string }
interface RoleView {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}
interface AccessView { permissions: PermissionOption[]; roles: RoleView[] }

useHead({ title: 'Acessos' });
const api = useApi();
const auth = useAuth();
const { data, pending, error, refresh } = await useAsyncData('access-control', () => api<AccessView>('/access'), { server: false });
const canManage = computed(() => auth.session.value?.user.permissions.includes('roles.manage'));
const creating = ref(false);
const editingRoleId = ref<string | null>(null);
const saving = ref(false);
const errorMessage = ref('');
const keyEdited = ref(false);
const form = reactive({ name: '', key: '', permissions: [] as string[] });
const groupNames: Record<string, string> = {
  events: 'Eventos e inscrições',
  users: 'Membros',
  roles: 'Papéis e acessos',
  settings: 'Configurações',
  audit: 'Auditoria',
  conversations: 'Conversas',
  channels: 'Canais de conversa',
};
const permissionGroups = computed(() => {
  const groups = new Map<string, PermissionOption[]>();
  for (const permission of data.value?.permissions ?? []) {
    const context = permission.key.split('.')[0] ?? 'other';
    groups.set(context, [...(groups.get(context) ?? []), permission]);
  }
  return [...groups.entries()].map(([key, permissions]) => ({ key, name: groupNames[key] ?? key, permissions }));
});
const permissionDescription = computed(() => new Map((data.value?.permissions ?? []).map((item) => [item.key, item.description])));

watch(() => form.name, (name) => {
  if (keyEdited.value) return;
  form.key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 62);
});

function openCreate() {
  Object.assign(form, { name: '', key: '', permissions: [] });
  editingRoleId.value = null;
  keyEdited.value = false;
  errorMessage.value = '';
  creating.value = true;
}

function openEdit(role: RoleView) {
  Object.assign(form, { name: role.name, key: role.key, permissions: [...role.permissions] });
  editingRoleId.value = role.id;
  keyEdited.value = true;
  errorMessage.value = '';
  creating.value = true;
}

async function saveRole() {
  saving.value = true;
  errorMessage.value = '';
  try {
    if (editingRoleId.value) {
      await api(`/access/roles/${editingRoleId.value}`, { method: 'PUT', body: { permissions: form.permissions } });
    } else {
      await api('/access/roles', { method: 'POST', body: form });
    }
    creating.value = false;
    await refresh();
  } catch (requestError: any) {
    const message = requestError?.data?.message;
    errorMessage.value = Array.isArray(message) ? message.join(' ') : message ?? 'Não foi possível salvar o papel.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page page--access">
    <header class="page-header">
      <div><p class="eyebrow">Segurança</p><h1>Acessos e permissões</h1><p class="muted">Papéis agrupam permissões granulares dentro desta comunidade.</p></div>
      <button v-if="canManage" class="button button--primary" type="button" @click="openCreate">＋ Novo papel</button>
    </header>

    <section class="summary-grid summary-grid--compact" aria-label="Resumo dos acessos">
      <article class="summary-card"><span class="summary-icon green">⌘</span><p>Papéis</p><strong>{{ data?.roles.length ?? '—' }}</strong><small>configurados</small></article>
      <article class="summary-card"><span class="summary-icon blue">✓</span><p>Permissões</p><strong>{{ data?.permissions.length ?? '—' }}</strong><small>granulares</small></article>
      <article class="summary-card"><span class="summary-icon gold">◇</span><p>Papéis do sistema</p><strong>{{ data?.roles.filter(role => role.isSystem).length ?? '—' }}</strong><small>modelos iniciais</small></article>
    </section>

    <section v-if="creating" class="access-editor" aria-labelledby="role-editor-title">
      <div class="access-editor__heading"><div><p class="eyebrow">Controle de acesso</p><h2 id="role-editor-title">{{ editingRoleId ? 'Editar permissões' : 'Criar papel' }}</h2><p>{{ editingRoleId ? 'A alteração passa a valer nas próximas requisições dos usuários.' : 'Escolha um nome e somente as permissões necessárias.' }}</p></div><button class="icon-close" type="button" aria-label="Fechar" @click="creating = false">×</button></div>
      <form @submit.prevent="saveRole">
        <div class="form-grid">
          <label class="field"><span>Nome do papel <b>*</b></span><input v-model="form.name" minlength="2" maxlength="80" placeholder="Ex.: Líder de eventos" required :disabled="Boolean(editingRoleId)"></label>
          <label class="field"><span>Chave técnica <b>*</b></span><input v-model="form.key" minlength="2" maxlength="63" pattern="[a-z][a-z0-9_-]+" placeholder="lider_eventos" required :disabled="Boolean(editingRoleId)" @input="keyEdited = true"><small>Usada por integrações; não muda com a tradução da interface.</small></label>
        </div>
        <div class="permission-selector">
          <section v-for="group in permissionGroups" :key="group.key" class="permission-group">
            <header><h3>{{ group.name }}</h3><small>{{ group.permissions.length }} permissões</small></header>
            <label v-for="permission in group.permissions" :key="permission.key" class="permission-option"><input v-model="form.permissions" type="checkbox" :value="permission.key"><span><strong>{{ permission.description }}</strong><code>{{ permission.key }}</code></span></label>
          </section>
        </div>
        <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>
        <footer class="access-editor__actions"><button class="button" type="button" @click="creating = false">Cancelar</button><button class="button button--primary" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : editingRoleId ? 'Salvar permissões' : 'Criar papel' }}</button></footer>
      </form>
    </section>

    <section class="section-block">
      <div class="section-heading"><div><h2>Papéis da comunidade</h2><p class="muted">A autorização usa as permissões abaixo, nunca o nome do papel.</p></div></div>
      <div v-if="pending" class="empty-card">Carregando acessos…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar os acessos.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else class="role-card-grid">
        <article v-for="role in data?.roles" :key="role.id" class="access-role-card">
          <header><span class="role-symbol">{{ role.name.charAt(0).toUpperCase() }}</span><div><div class="role-title"><h3>{{ role.name }}</h3><span v-if="role.isSystem" class="badge badge--draft">Sistema</span></div><code>{{ role.key }}</code></div></header>
          <div class="role-permissions"><p>{{ role.permissions.length }} permissões</p><ul v-if="role.permissions.length"><li v-for="permission in role.permissions" :key="permission"><span>✓</span><div><strong>{{ permissionDescription.get(permission) ?? permission }}</strong><code>{{ permission }}</code></div></li></ul><p v-else class="muted">Nenhuma permissão atribuída.</p></div>
          <footer v-if="canManage"><button class="button button--small" type="button" @click="openEdit(role)">Editar permissões</button></footer>
        </article>
      </div>
    </section>
  </div>
</template>

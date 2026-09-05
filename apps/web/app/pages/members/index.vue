<script setup lang="ts">
interface MemberRole {
  id: string;
  key: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  roles: MemberRole[];
  confirmedRegistrations: number;
}

useHead({ title: 'Membros' });
const api = useApi();
const auth = useAuth();
const search = ref('');
const role = ref('all');
const { data: members, pending, error, refresh } = await useAsyncData('members', () => api<Member[]>('/access/users'), { server: false });
const canCreate = computed(() => auth.session.value?.user.permissions.includes('users.create')
  && auth.session.value?.user.permissions.includes('roles.read'));
const canReadProfile = computed(() => auth.session.value?.user.permissions.includes('members.profile_read'));
const roles = computed(() => {
  const byId = new Map<string, MemberRole>();
  for (const member of members.value ?? []) {
    for (const item of member.roles) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
});
const filteredMembers = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR');
  return (members.value ?? []).filter((member) => {
    const matchesSearch = !term
      || member.name.toLocaleLowerCase('pt-BR').includes(term)
      || member.email.toLocaleLowerCase('pt-BR').includes(term);
    const matchesRole = role.value === 'all' || member.roles.some((item) => item.id === role.value);
    return matchesSearch && matchesRole;
  });
});
const registrations = computed(() => (members.value ?? []).reduce((total, member) => total + member.confirmedRegistrations, 0));
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div><p class="eyebrow">Comunidade</p><h1>Membros</h1><p class="muted">Pessoas com acesso e participação nos eventos da comunidade.</p></div>
      <NuxtLink v-if="canCreate" to="/members/new" class="button button--primary">＋ Novo membro</NuxtLink>
    </header>

    <section class="summary-grid summary-grid--compact" aria-label="Resumo dos membros">
      <article class="summary-card"><span class="summary-icon green">♙</span><p>Pessoas cadastradas</p><strong>{{ members?.length ?? '—' }}</strong><small>nesta comunidade</small></article>
      <article class="summary-card"><span class="summary-icon blue">⌘</span><p>Papéis em uso</p><strong>{{ roles.length }}</strong><small>na lista atual</small></article>
      <article class="summary-card"><span class="summary-icon gold">✓</span><p>Inscrições</p><strong>{{ registrations }}</strong><small>confirmadas por membros</small></article>
    </section>

    <section class="section-block">
      <div class="member-filters">
        <label class="search-field"><span aria-hidden="true">⌕</span><input v-model="search" type="search" placeholder="Buscar por nome ou e-mail" aria-label="Buscar membros"></label>
        <label class="role-filter"><span>Filtrar por papel</span><select v-model="role"><option value="all">Todos os papéis</option><option v-for="item in roles" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      </div>

      <div v-if="pending" class="empty-card">Carregando membros…</div>
      <div v-else-if="error" class="empty-card"><p>Não foi possível carregar os membros.</p><button class="button" @click="refresh()">Tentar novamente</button></div>
      <div v-else-if="!filteredMembers.length" class="empty-card"><span class="empty-icon">♙</span><h3>Nenhum membro encontrado</h3><p>Altere os filtros para consultar outras pessoas.</p></div>
      <div v-else class="member-table-wrap">
        <table class="member-table">
          <thead><tr><th>Membro</th><th>Papéis</th><th>Desde</th><th>Inscrições confirmadas</th><th v-if="canReadProfile">Perfil</th></tr></thead>
          <tbody>
            <tr v-for="member in filteredMembers" :key="member.id">
              <td><div class="member-identity"><span class="member-avatar">{{ member.name.charAt(0).toUpperCase() }}</span><span><strong>{{ member.name }}</strong><small>{{ member.email }}</small></span></div></td>
              <td><div class="role-list"><span v-for="item in member.roles" :key="item.id" class="role-chip">{{ item.name }}</span><span v-if="!member.roles.length" class="muted">Sem papel</span></div></td>
              <td>{{ dateFormatter.format(new Date(member.createdAt)) }}</td>
              <td><strong class="registration-total">{{ member.confirmedRegistrations }}</strong></td>
              <td v-if="canReadProfile"><NuxtLink :to="`/members/${member.id}`" class="button button--small">Ver perfil</NuxtLink></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

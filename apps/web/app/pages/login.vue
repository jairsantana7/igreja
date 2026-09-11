<script setup lang="ts">
import { sessionHomePath } from '~/utils/session-home';

definePageMeta({ layout: 'login' });
useHead({ title: 'Entrar' });

const config = useRuntimeConfig();
const api = useApi();
const auth = useAuth();
const route = useRoute();
const tenantSlug = ref(import.meta.dev ? 'comunidade-demo' : '');
const identifier = ref(import.meta.dev ? 'admin@comunidade.local' : '');
const password = ref(import.meta.dev ? 'Comunidade#2026' : '');
const showPassword = ref(false);
const loading = ref(false);
const errorMessage = ref('');

async function login() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await api<{ sessionProof: string; user: any }>('/auth/login', {
      method: 'POST', body: { tenantSlug: tenantSlug.value, identifier: identifier.value, password: password.value },
    });
    auth.setSession(response);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/g/')
      ? route.query.redirect
      : sessionHomePath(response.user);
    await navigateTo(redirect);
  } catch (error: any) {
    errorMessage.value = error?.data?.message ?? 'Não foi possível entrar.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-grid">
    <section class="login-showcase">
      <img src="/images/login-community.png" alt="" class="login-showcase__image">
      <div class="login-showcase__overlay" />
      <div class="login-showcase__grid" />
      <div class="login-showcase__content">
        <AppLogo light />
        <div class="showcase-copy">
          <p class="eyebrow eyebrow--light">Pessoas, cuidado e propósito</p>
          <h1>Organize encontros.<br>Aproxime pessoas.</h1>
          <p>Crie eventos, personalize inscrições e acompanhe cada confirmação em um só lugar.</p>
          <ul>
            <li><span>✓</span> Formulários do seu jeito</li>
            <li><span>✓</span> Inscrição simples para membros</li>
            <li><span>✓</span> Dados separados por comunidade</li>
          </ul>
        </div>
        <small>Uma base segura e aberta para servir melhor.</small>
      </div>
    </section>

    <section class="login-panel">
      <div class="mobile-logo"><AppLogo /></div>
      <form class="login-card" @submit.prevent="login">
        <p class="eyebrow">Área segura</p>
        <h2>Acesse sua conta</h2>
        <p class="muted">Entre para continuar no {{ config.public.appName }}.</p>

        <label class="field"><span>Comunidade</span><input v-model="tenantSlug" autocomplete="organization" placeholder="codigo-da-comunidade" required></label>
        <label class="field"><span>E-mail ou WhatsApp</span><input v-model="identifier" type="text" autocomplete="username" placeholder="nome@exemplo.com ou (00) 00000-0000" required></label>
        <label class="field"><span>Senha</span><span class="password-wrap"><input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Digite sua senha" required><button type="button" @click="showPassword = !showPassword">{{ showPassword ? 'Ocultar' : 'Mostrar' }}</button></span></label>

        <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>
        <button class="button button--primary button--large" type="submit" :disabled="loading">{{ loading ? 'Entrando…' : 'Entrar no sistema' }}</button>

        <div class="social-note"><span>Um acesso para cada necessidade</span><p>A equipe entra na gestão. Membros consultam eventos disponíveis e revisam as próprias inscrições.</p></div>
        <footer><span>Ambiente protegido</span><span>{{ config.public.appName }}</span></footer>
      </form>
    </section>
  </div>
</template>

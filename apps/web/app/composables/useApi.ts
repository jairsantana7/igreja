export function useApi() {
  const config = useRuntimeConfig();
  const auth = useAuth();
  const nuxtApp = useNuxtApp();

  return async function api<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    if (auth.session.value?.sessionProof) headers.set('X-Session-Proof', auth.session.value.sessionProof);
    try {
      return await $fetch<T>(path, { ...options, baseURL: String(config.public.apiBaseUrl), headers, credentials: 'include' });
    } catch (error: any) {
      if (error?.response?.status === 401 && !path.includes('/login')) {
        auth.logout();
        await nuxtApp.runWithContext(() => navigateTo('/login'));
      }
      throw error;
    }
  };
}

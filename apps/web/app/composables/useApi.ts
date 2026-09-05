export function useApi() {
  const config = useRuntimeConfig();
  const auth = useAuth();

  return async function api<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    const headers = new Headers(options.headers as HeadersInit | undefined);
    if (auth.session.value?.accessToken) headers.set('Authorization', `Bearer ${auth.session.value.accessToken}`);
    try {
      return await $fetch<T>(path, { ...options, baseURL: String(config.public.apiBaseUrl), headers });
    } catch (error: any) {
      if (error?.response?.status === 401 && !path.includes('/login')) {
        auth.logout();
        await navigateTo('/login');
      }
      throw error;
    }
  };
}

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  const isPublic = to.path === '/login' || to.path.startsWith('/e/');
  const auth = useAuth();
  auth.hydrate();
  if (!isPublic && !auth.session.value) return navigateTo('/login');
  if (to.path === '/login' && auth.session.value) return navigateTo('/dashboard');
});

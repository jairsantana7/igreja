export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  const isPublic = to.path === '/login' || to.path.startsWith('/e/') || to.path.startsWith('/g/') || to.path.startsWith('/cadastro/');
  const auth = useAuth();
  auth.hydrate();
  if (!isPublic && !auth.session.value) return navigateTo('/login');
  if (to.path === '/login' && auth.session.value) {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/g/') ? to.query.redirect : '/dashboard';
    return navigateTo(redirect);
  }
});

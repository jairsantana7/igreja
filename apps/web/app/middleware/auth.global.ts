import { sessionHomePath } from '../utils/session-home';

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  const isPublic = to.path === '/login' || to.path.startsWith('/e/') || to.path.startsWith('/g/') || to.path.startsWith('/cadastro/');
  const auth = useAuth();
  auth.hydrate();
  if (!isPublic && !auth.session.value) return navigateTo('/login');
  if (to.path === '/login' && auth.session.value) {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/g/')
      ? to.query.redirect
      : sessionHomePath(auth.session.value.user);
    return navigateTo(redirect);
  }
  if (!auth.session.value) return;

  const permissions = auth.session.value.user.permissions;
  const requiredPermission = to.path === '/events/new'
    ? 'events.create'
    : (to.path === '/dashboard' || to.path === '/events' || to.path.startsWith('/events/'))
        ? 'events.read'
        : to.path === '/my-events'
          ? 'events.member_portal_read'
          : null;
  if (requiredPermission && !permissions.includes(requiredPermission)) {
    return navigateTo(sessionHomePath(auth.session.value.user));
  }
});

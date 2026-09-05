const apiBaseUrl = process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3101/api';
const apiOrigin = /^https?:\/\//.test(apiBaseUrl) ? new URL(apiBaseUrl).origin : "'self'";
const developmentConnect = process.env.NODE_ENV === 'production' ? '' : ' ws: wss:';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  srcDir: 'app/',
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      appName: process.env.APP_NAME ?? 'Minha Comunidade',
      apiBaseUrl,
    },
  },
  routeRules: {
    '/**': { headers: {
      'Content-Security-Policy': `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${apiOrigin}; connect-src 'self' ${apiOrigin}${developmentConnect}; font-src 'self' data:`,
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    } },
    '/dashboard': { ssr: false },
    '/events/**': { ssr: false },
    '/members/**': { ssr: false },
    '/access': { ssr: false },
    '/audit': { ssr: false },
    '/settings': { ssr: false },
    '/conversations': { ssr: false },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      titleTemplate: `%s · ${process.env.APP_NAME ?? 'Minha Comunidade'}`,
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#173d32' },
        { name: 'description', content: 'Eventos e inscrições da comunidade.' },
      ],
    },
  },
  typescript: { strict: true, typeCheck: true },
});

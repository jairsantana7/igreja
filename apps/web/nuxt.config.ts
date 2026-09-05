export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  srcDir: 'app/',
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      appName: process.env.APP_NAME ?? 'Minha Comunidade',
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3101/api',
    },
  },
  routeRules: {
    '/dashboard': { ssr: false },
    '/events/**': { ssr: false },
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

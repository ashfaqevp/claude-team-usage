import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase', '@nuxt/icon'],
  css: ['~/assets/css/tailwind.css'],
  // This is a dark-only product by design — no light-mode toggle exists, so the
  // theme is forced here rather than left to prefers-color-scheme.
  app: {
    head: {
      htmlAttrs: { class: 'dark' },
      title: 'Claude Room',
      link: [
        // Modern browsers prefer the crisp SVG mark; favicon.ico (16/32/48) is
        // the fallback for those that don't support SVG favicons.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },
  icon: {
    // Bundled from @iconify-json/lucide at build time - no runtime calls to the
    // Iconify API, so icons keep working offline / without external requests.
    provider: 'server',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  supabase: {
    // url/key/secretKey are read from SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY /
    // SUPABASE_SECRET_KEY in dashboard/.env (module env-var fallbacks). The secret
    // key never enters runtimeConfig.public — server routes reach it only via the
    // serverSupabaseServiceRole() composable.
    redirect: false,
  },
})

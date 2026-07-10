import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase', '@nuxt/icon'],
  css: ['~/assets/css/tailwind.css'],
  // Default-dark product with an opt-in light theme (see app/composables/useTheme.ts).
  // The html gets `class="dark"` at SSR so the default render is dark; the inline
  // head script below runs before first paint and flips to light only when the
  // visitor has previously chosen it (localStorage 'cr-theme'), avoiding any FOUC.
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
      script: [
        {
          // Runs pre-paint: honour a saved theme choice without a flash of the
          // wrong palette. Defaults to dark (matches the SSR html class).
          innerHTML:
            "(function(){try{var t=localStorage.getItem('cr-theme');document.documentElement.classList.toggle('dark',t!=='light');}catch(e){}})()",
          tagPosition: 'head',
        },
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

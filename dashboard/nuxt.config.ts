import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/tailwind.css'],
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

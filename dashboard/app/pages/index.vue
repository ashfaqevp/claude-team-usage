<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()

// Already signed in (session cookie present) - redirect at the server level so
// /dashboard always gets a full SSR render, the same path a refresh takes.
if (user.value) {
  await navigateTo('/dashboard')
}

// GitHub redirects back here with ?code=... which the Supabase browser client
// exchanges for a session automatically (detectSessionInUrl). Once that lands,
// force a full browser navigation rather than a client-side route change, so
// /dashboard is always reached via a fresh server render with the
// just-written session cookie - never a client-only mount of its component
// tree, which is what rendered broken right after the OAuth redirect.
watch(user, (u) => {
  if (u) window.location.href = '/dashboard'
})

async function signIn() {
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin },
  })
}

async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}
</script>

<template>
  <SignInScreen @sign-in="signIn" @sign-in-google="signInWithGoogle" />
</template>

<script setup lang="ts">
import { ref } from 'vue'

const user = useSupabaseUser()
const supabase = useSupabaseClient()

// Already signed in (session cookie present) - redirect at the server level so
// /dashboard always gets a full SSR render, the same path a refresh takes.
if (user.value) {
  await navigateTo('/dashboard')
}

// The OAuth provider (or, now, a password sign-in / email confirmation landing back
// on a session) redirects/updates here, which the Supabase browser client picks up
// automatically (detectSessionInUrl / onAuthStateChange). Once that lands, force a
// full browser navigation rather than a client-side route change, so /dashboard is
// always reached via a fresh server render with the just-written session cookie -
// never a client-only mount of its component tree, which is what rendered broken
// right after the OAuth redirect.
watch(user, (u) => {
  if (u) window.location.href = '/dashboard'
})

const submitting = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')
const showResend = ref(false)

function resetMessages() {
  errorMessage.value = ''
  infoMessage.value = ''
  showResend.value = false
}

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

async function submitLogin({ email, password }: { email: string; password: string }) {
  resetMessages()
  submitting.value = true
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  submitting.value = false

  if (!error) return // the watch(user) above handles the redirect once the session lands

  if (error.code === 'email_not_confirmed') {
    errorMessage.value = 'Please confirm your email first.'
    showResend.value = true
  }
  else if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    errorMessage.value = 'Too many attempts — please wait a bit and try again.'
  }
  else {
    errorMessage.value = 'Invalid email or password.'
  }
}

async function submitSignup({ email, password }: { email: string; password: string }) {
  resetMessages()
  submitting.value = true
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/confirm?email=${encodeURIComponent(email)}` },
  })
  submitting.value = false

  if (error) {
    if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
      errorMessage.value = 'Too many attempts — please wait a bit and try again.'
    }
    else if (error.code === 'weak_password') {
      errorMessage.value = 'Password must be at least 8 characters and include letters and digits.'
    }
    else {
      errorMessage.value = error.message
    }
    return
  }

  // Deliberately the SAME message whether this email is brand new or already
  // registered (Supabase's signUp() returns 200 either way, obfuscated, so this
  // never leaks which emails already have accounts - see PROJECT_STATUS.md).
  infoMessage.value = 'Check your email to confirm your account.'
}

async function submitForgot({ email }: { email: string }) {
  resetMessages()
  submitting.value = true
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  submitting.value = false
  // Always the same message, regardless of whether the email is registered - never
  // reveal which emails have accounts.
  infoMessage.value = 'If that email is registered, a reset link was sent.'
}

async function resend({ email }: { email: string }) {
  if (!email) return
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (!error) {
    infoMessage.value = 'Confirmation email resent — check your inbox.'
    showResend.value = false
  }
}
</script>

<template>
  <SignInScreen
    :submitting="submitting"
    :error-message="errorMessage"
    :info-message="infoMessage"
    :show-resend="showResend"
    @sign-in="signIn"
    @sign-in-google="signInWithGoogle"
    @submit-login="submitLogin"
    @submit-signup="submitSignup"
    @submit-forgot="submitForgot"
    @resend="resend"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CircleAlert, Mail } from '@lucide/vue'

defineProps<{
  submitting: boolean
  errorMessage: string
  infoMessage: string
  showResend: boolean
}>()

const emit = defineEmits<{
  signIn: []
  signInGoogle: []
  submitLogin: [{ email: string; password: string }]
  submitSignup: [{ email: string; password: string }]
  submitForgot: [{ email: string }]
  resend: [{ email: string }]
}>()

type Mode = 'login' | 'signup' | 'forgot'
const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const localError = ref('')

function switchMode(next: Mode) {
  mode.value = next
  password.value = ''
  confirmPassword.value = ''
  localError.value = ''
}

function submit() {
  localError.value = ''
  const trimmedEmail = email.value.trim()

  if (mode.value === 'signup' && password.value !== confirmPassword.value) {
    localError.value = 'Passwords do not match.'
    return
  }

  if (mode.value === 'login') emit('submitLogin', { email: trimmedEmail, password: password.value })
  else if (mode.value === 'signup') emit('submitSignup', { email: trimmedEmail, password: password.value })
  else emit('submitForgot', { email: trimmedEmail })
}

function resendClick() {
  emit('resend', { email: email.value.trim() })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4 py-10">
    <div class="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-card">
      <div class="text-center">
        <BrandLogo :size="36" wordmark-class="text-2xl" class="justify-center" />
        <p class="mt-3 text-sm text-muted-foreground">
          See how your shared Claude account's usage is split across your Room.
        </p>
      </div>

      <form class="mt-7 space-y-4 text-left" @submit.prevent="submit">
        <div class="space-y-1.5">
          <label for="email" class="text-sm font-medium">Email</label>
          <Input id="email" v-model="email" type="email" autocomplete="username" required />
        </div>

        <div v-if="mode !== 'forgot'" class="space-y-1.5">
          <label for="password" class="text-sm font-medium">Password</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            minlength="8"
            required
          />
        </div>

        <div v-if="mode === 'signup'" class="space-y-1.5">
          <label for="confirm-password" class="text-sm font-medium">Confirm password</label>
          <Input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>

        <p v-if="localError || errorMessage" class="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert class="size-3.5 shrink-0" />
          <span>{{ localError || errorMessage }}</span>
        </p>
        <p v-if="infoMessage" class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Mail class="size-3.5 shrink-0" />
          <span>{{ infoMessage }}</span>
        </p>
        <button
          v-if="showResend"
          type="button"
          class="cursor-pointer text-sm underline underline-offset-2"
          @click="resendClick"
        >
          Resend confirmation email
        </button>

        <Button type="submit" class="w-full" size="lg" :disabled="submitting">
          {{ submitting
            ? 'Please wait…'
            : mode === 'login' ? 'Log in'
              : mode === 'signup' ? 'Sign up'
                : 'Send reset link' }}
        </Button>

        <div class="flex justify-center gap-4 text-xs">
          <button v-if="mode !== 'login'" type="button" class="cursor-pointer underline underline-offset-2" @click="switchMode('login')">Log in</button>
          <button v-if="mode !== 'signup'" type="button" class="cursor-pointer underline underline-offset-2" @click="switchMode('signup')">Sign up</button>
          <button v-if="mode !== 'forgot'" type="button" class="cursor-pointer underline underline-offset-2" @click="switchMode('forgot')">Forgot password?</button>
        </div>
      </form>

      <div class="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span class="h-px flex-1 bg-border" />
        or continue with
        <span class="h-px flex-1 bg-border" />
      </div>

      <div class="mt-4 space-y-2">
        <Button class="w-full" variant="outline" @click="$emit('signIn')">
          <svg viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true">
            <path
              d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.79-.25.79-.55
                 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68
                 -1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.34.96
                 .1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.09
                 -.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0
                 c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09
                 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18
                 0 .3.21.66.79.55A10.52 10.52 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z"
            />
          </svg>
          GitHub
        </Button>

        <Button class="w-full" variant="outline" @click="$emit('signInGoogle')">
          <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88
                 c2.27-2.09 3.54-5.17 3.54-8.82Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15
                 -3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A11.99 11.99 0 0 0 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A11.99 11.99
                 0 0 0 0 12c0 1.94.47 3.77 1.27 5.39l4-3.11Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26
                 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
            />
          </svg>
          Google
        </Button>
      </div>

      <p class="mt-6 text-center text-xs text-muted-foreground">
        Use the account whose email matches your Claude account — GitHub, Google, or email/password.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CircleAlert } from '@lucide/vue'

// Room-owner email confirmation landing page - separate from /admin entirely
// (admin login is a different table/flow and never lands here).
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

const status = ref<'checking' | 'invalid'>('checking')
const resendEmail = ref(typeof route.query.email === 'string' ? route.query.email : '')
const resent = ref(false)
const resendError = ref('')

let timeoutId: ReturnType<typeof setTimeout> | undefined

async function checkSession() {
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    window.location.href = '/dashboard'
    return true
  }
  return false
}

onMounted(async () => {
  if (await checkSession()) return
  // @supabase/ssr exchanges the emailed link's code for a session asynchronously on
  // mount (detectSessionInUrl) - give that a moment before declaring the link dead.
  timeoutId = setTimeout(async () => {
    if (!(await checkSession())) status.value = 'invalid'
  }, 1500)
})

onUnmounted(() => {
  if (timeoutId) clearTimeout(timeoutId)
})

watch(user, (u) => {
  if (u) window.location.href = '/dashboard'
})

async function resend() {
  resendError.value = ''
  resent.value = false
  const email = resendEmail.value.trim()
  if (!email) {
    resendError.value = 'Enter your email address.'
    return
  }
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) resendError.value = error.message
  else resent.value = true
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <div class="w-full max-w-sm text-center">
      <div v-if="status === 'checking'" class="text-sm text-muted-foreground">
        Confirming…
      </div>

      <template v-else>
        <h1 class="text-xl font-semibold tracking-tight">Link expired or invalid</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          This confirmation link is no longer valid. Enter your email to get a new one.
        </p>

        <div class="mt-6 space-y-3 text-left">
          <Input v-model="resendEmail" type="email" placeholder="you@example.com" autocomplete="username" />
          <Button class="w-full" variant="outline" @click="resend">Resend confirmation email</Button>

          <p v-if="resent" class="text-sm text-muted-foreground">Check your email for a new link.</p>
          <p v-if="resendError" class="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert class="size-3.5 shrink-0" />
            {{ resendError }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

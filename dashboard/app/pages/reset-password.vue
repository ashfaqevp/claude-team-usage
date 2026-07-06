<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CircleAlert } from '@lucide/vue'

// Room-owner password reset landing page - separate from /admin entirely.
const supabase = useSupabaseClient()

const stage = ref<'verifying' | 'ready' | 'invalid'>('verifying')
const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const errorMessage = ref('')

let unsubscribe: (() => void) | undefined
let timeoutId: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') stage.value = 'ready'
  })
  unsubscribe = () => data.subscription.unsubscribe()

  timeoutId = setTimeout(() => {
    if (stage.value === 'verifying') stage.value = 'invalid'
  }, 4000)
})

onUnmounted(() => {
  unsubscribe?.()
  if (timeoutId) clearTimeout(timeoutId)
})

async function submit() {
  errorMessage.value = ''
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }
  submitting.value = true
  const { error } = await supabase.auth.updateUser({ password: newPassword.value })
  submitting.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }
  window.location.href = '/dashboard'
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <div class="w-full max-w-sm text-center">
      <div v-if="stage === 'verifying'" class="text-sm text-muted-foreground">
        Verifying reset link…
      </div>

      <div v-else-if="stage === 'invalid'">
        <h1 class="text-xl font-semibold tracking-tight">Link expired or invalid</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          Request a new reset link from the sign-in page.
        </p>
        <Button class="mt-6 w-full" variant="outline" @click="navigateTo('/')">Back to sign-in</Button>
      </div>

      <form v-else class="text-left" @submit.prevent="submit">
        <h1 class="text-center text-xl font-semibold tracking-tight">Choose a new password</h1>

        <div class="mt-6 space-y-3">
          <div class="space-y-1.5">
            <label for="new-password" class="text-sm font-medium">New password</label>
            <Input id="new-password" v-model="newPassword" type="password" autocomplete="new-password" minlength="8" required />
          </div>
          <div class="space-y-1.5">
            <label for="confirm-password" class="text-sm font-medium">Confirm password</label>
            <Input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />
          </div>

          <p v-if="errorMessage" class="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert class="size-3.5 shrink-0" />
            {{ errorMessage }}
          </p>

          <Button type="submit" class="w-full" :disabled="submitting">
            {{ submitting ? 'Saving…' : 'Save password' }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>

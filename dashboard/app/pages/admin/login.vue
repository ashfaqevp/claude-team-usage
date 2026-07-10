<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CircleAlert, ShieldCheck } from '@lucide/vue'

const supabase = useSupabaseClient()
const router = useRouter()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  submitting.value = true
  errorMessage.value = ''

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })

  if (error) {
    submitting.value = false
    errorMessage.value = 'Invalid email or password.'
    return
  }

  // @nuxtjs/supabase updates useSupabaseUser() asynchronously off an
  // onAuthStateChange callback that isn't awaited by signInWithPassword. Without this,
  // router.push('/admin') can land before that state settles, so admin/index.vue's
  // onMounted sees a stale null user and immediately bounces back to /admin/login.
  const { data: claimsData } = await supabase.auth.getClaims()
  useSupabaseUser().value = claimsData?.claims ?? null

  submitting.value = false
  await router.push('/admin')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4 py-10">
    <Card class="w-full max-w-sm shadow-card">
      <CardHeader>
        <div class="flex items-center gap-2 text-muted-foreground">
          <ShieldCheck class="size-4" />
          <span class="text-xs font-medium uppercase tracking-wide">Operator sign-in</span>
        </div>
        <CardTitle class="flex items-center gap-2 text-lg">
          <BrandLogo :size="26" />
          <span class="text-sm font-medium text-muted-foreground">Admin</span>
        </CardTitle>
        <CardDescription>Sign in with your admin email and password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-1.5">
            <label for="admin-email" class="text-sm font-medium">Email</label>
            <Input id="admin-email" v-model="email" type="email" autocomplete="username" required />
          </div>
          <div class="space-y-1.5">
            <label for="admin-password" class="text-sm font-medium">Password</label>
            <Input id="admin-password" v-model="password" type="password" autocomplete="current-password" required />
          </div>

          <div v-if="errorMessage" class="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert class="size-3.5" />
            {{ errorMessage }}
          </div>

          <Button type="submit" class="w-full" :disabled="submitting">
            {{ submitting ? 'Signing in…' : 'Sign in' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

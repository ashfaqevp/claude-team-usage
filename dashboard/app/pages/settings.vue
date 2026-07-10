<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sun, Moon, Check, LogOut, Shield } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard' })

const { data, refresh } = useMyRoom()
const { isDark, set: setTheme } = useTheme()
const user = useSupabaseUser()
const supabase = useSupabaseClient()

const roomName = ref('')
const dirty = ref(false)
const saving = ref(false)
const saved = ref(false)

// Keep the field in sync with the fetched name until the user starts editing.
watchEffect(() => {
  if (data.value && !dirty.value) roomName.value = data.value.roomName ?? ''
})

function onInput() {
  dirty.value = true
  saved.value = false
}

async function saveName() {
  const trimmed = roomName.value.trim()
  if (!trimmed) return
  saving.value = true
  try {
    await $fetch('/api/room-name', { method: 'POST', body: { roomName: trimmed } })
    if (data.value) data.value.roomName = trimmed
    await refresh()
    dirty.value = false
    saved.value = true
  }
  finally {
    saving.value = false
  }
}

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex max-w-[720px] flex-col gap-6">
    <div>
      <h1 class="font-serif text-[26px] font-medium">Settings</h1>
      <p class="mt-1 text-sm text-ink-3">Manage how your Room appears and how you sign in.</p>
    </div>

    <!-- Room identity -->
    <section class="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 class="text-[15px] font-semibold">Room name</h2>
      <p class="mt-1 text-[13px] text-ink-3">Shown across the dashboard instead of the tracked email address.</p>
      <div class="mt-4 flex flex-wrap items-center gap-2.5">
        <Input
          v-model="roomName"
          placeholder="e.g. Acme Engineering"
          class="max-w-xs"
          @input="onInput"
          @keyup.enter="saveName"
        />
        <Button :disabled="saving || !roomName.trim() || !dirty" @click="saveName">
          <Check v-if="saved && !dirty" class="size-4" />
          {{ saving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save' }}
        </Button>
      </div>
    </section>

    <!-- Tracked account -->
    <section class="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 class="text-[15px] font-semibold">Tracked Claude account</h2>
      <p class="mt-1 text-[13px] text-ink-3">Usage is attributed to this account's org email. It's derived from your verified sign-in — it can't be changed here.</p>
      <div class="mono mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px]">
        {{ data?.claudeEmail ?? '—' }}
      </div>
    </section>

    <!-- Appearance -->
    <section class="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 class="text-[15px] font-semibold">Appearance</h2>
      <p class="mt-1 text-[13px] text-ink-3">Choose how Claude Room looks. Remembered on this device.</p>
      <div class="mt-4 grid max-w-sm grid-cols-2 gap-2.5">
        <button
          class="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
          :class="!isDark ? 'border-primary bg-accent-soft text-accent-ink' : 'border-border text-ink-2 hover:text-ink'"
          @click="setTheme(false)"
        >
          <Sun class="size-4" /> Light
        </button>
        <button
          class="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
          :class="isDark ? 'border-primary bg-accent-soft text-accent-ink' : 'border-border text-ink-2 hover:text-ink'"
          @click="setTheme(true)"
        >
          <Moon class="size-4" /> Dark
        </button>
      </div>
    </section>

    <!-- Session -->
    <section class="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 class="text-[15px] font-semibold">Session</h2>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-[13px] text-ink-3">Signed in as</div>
          <div class="text-sm font-medium">{{ user?.email }}</div>
        </div>
        <Button variant="outline" size="sm" @click="signOut">
          <LogOut class="size-3.5" /> Sign out
        </Button>
      </div>
      <NuxtLink
        v-if="data?.isAdmin"
        to="/admin"
        class="mt-4 inline-flex items-center gap-2 text-[13px] text-accent-ink transition-opacity hover:opacity-80"
      >
        <Shield class="size-3.5" /> Open admin dashboard
      </NuxtLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'

defineEmits<{ signIn: []; signInGoogle: [] }>()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <div class="w-full max-w-sm text-center">
      <h1 class="text-2xl font-semibold tracking-tight">Claude Room</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        See how your shared Claude account's usage is split across your Room.
      </p>

      <Button class="mt-8 w-full" size="lg" @click="$emit('signIn')">
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
        Sign in with GitHub
      </Button>

      <Button class="mt-3 w-full" size="lg" variant="outline" @click="$emit('signInGoogle')">
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
        Sign in with Google
      </Button>

      <p class="mt-6 text-xs text-muted-foreground">
        Log in with the GitHub or Google account whose email matches your Claude account.
      </p>
    </div>
  </div>
</template>

// Light/dark theme state for the dashboard. The product defaults to dark (the
// SSR html carries `class="dark"`, and an inline head script in nuxt.config
// applies any saved preference before first paint). This composable keeps a
// shared reactive `isDark` flag in sync with that class + localStorage so the
// top-bar toggle and the theme-aware chart colors all read one source of truth.
export function useTheme() {
  // useState → shared singleton across every component that calls useTheme().
  const isDark = useState('cr-is-dark', () => true)

  function set(dark: boolean) {
    isDark.value = dark
    if (import.meta.client) {
      document.documentElement.classList.toggle('dark', dark)
      try {
        localStorage.setItem('cr-theme', dark ? 'dark' : 'light')
      }
      catch {}
    }
  }

  function toggle() {
    set(!isDark.value)
  }

  // Reconcile the reactive flag with whatever the pre-paint script already put on
  // <html> (which itself honoured localStorage). Runs once per mounting component,
  // but useState makes the write idempotent.
  onMounted(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })

  return { isDark, toggle, set }
}

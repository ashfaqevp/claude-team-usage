// Tiny .env reader for standalone scripts (not run through Nuxt, so Nuxt's own env
// loading doesn't apply). Only understands simple KEY=VALUE lines - good enough for
// dashboard/.env. Existing process.env values always win.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dashboardDir = dirname(dirname(fileURLToPath(import.meta.url)))

export function loadEnv() {
  let contents
  try {
    contents = readFileSync(join(dashboardDir, '.env'), 'utf8')
  } catch {
    return
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}

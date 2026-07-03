<script setup lang="ts">
interface TeamSummaryRow {
  user_name: string
  window_cost_usd: number | string
  account_five_hour_pct: number | string | null
  account_seven_day_pct: number | string | null
  five_hour_resets_at: string | null
  seven_day_resets_at: string | null
}

interface LatestPerUserRow {
  user_name: string
  machine: string | null
  model: string | null
  input_tokens: number | string | null
  output_tokens: number | string | null
  recorded_at: string
}

interface DailyUsageRow {
  user_name: string
  day: string
  peak_5h: number | string | null
  peak_7d: number | string | null
  total_cost_usd: number | string
  session_count: number | string
}

interface TeamSummaryResponse {
  teamSummary: TeamSummaryRow[]
  latestPerUser: LatestPerUserRow[]
  dailyUsage: DailyUsageRow[]
}

const { data, error, status, refresh } = await useFetch<TeamSummaryResponse>('/api/team-summary')

// Ticks once a second, client-side only, so countdowns and idle state stay live.
// Starts null so the first client render matches the server's (no hydration mismatch).
const now = ref<number | null>(null)
let clock: ReturnType<typeof setInterval> | undefined
let poll: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  poll = setInterval(() => { refresh() }, 30_000)
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
  if (poll) clearInterval(poll)
})

const num = (v: number | string | null | undefined) => v == null ? 0 : Number(v)

const header = computed(() => data.value?.teamSummary?.[0] ?? null)

function formatCountdown(resetsAt: string | null | undefined) {
  if (!resetsAt || now.value == null) return '—'
  const diffMs = new Date(resetsAt).getTime() - now.value
  if (diffMs <= 0) return 'resetting now'
  const totalMinutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `resets in ${hours}h ${minutes}m` : `resets in ${minutes}m`
}

function formatLastSeen(recordedAt: string | null | undefined) {
  if (!recordedAt || now.value == null) return '—'
  const diffMs = now.value - new Date(recordedAt).getTime()
  if (diffMs < 0) return 'just now'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m ago`
}

function isIdle(recordedAt: string | null | undefined) {
  if (!recordedAt || now.value == null) return false
  return now.value - new Date(recordedAt).getTime() > 30 * 60_000
}

// Slice thresholds: an estimate of each user's share of the 5h limit, not an
// absolute usage level — tuned for a 3-developer shared account.
function sliceLevel(pct: number): 'cool' | 'amber' | 'red' {
  if (pct >= 30) return 'red'
  if (pct >= 15) return 'amber'
  return 'cool'
}

const totalWindowCost = computed(() =>
  (data.value?.teamSummary ?? []).reduce((sum, row) => sum + num(row.window_cost_usd), 0)
)

const userCards = computed(() => {
  const latestByUser = new Map((data.value?.latestPerUser ?? []).map(row => [row.user_name, row]))
  const accountPct = num(header.value?.account_five_hour_pct)

  return (data.value?.teamSummary ?? [])
    .map((row) => {
      const latest = latestByUser.get(row.user_name)
      const windowCost = num(row.window_cost_usd)
      const slice = totalWindowCost.value > 0 ? (windowCost / totalWindowCost.value) * accountPct : 0
      return {
        userName: row.user_name,
        windowCost,
        slice,
        level: sliceLevel(slice),
        model: latest?.model ?? '—',
        inputTokens: num(latest?.input_tokens),
        outputTokens: num(latest?.output_tokens),
        recordedAt: latest?.recorded_at ?? null,
        idle: isIdle(latest?.recorded_at),
      }
    })
    .sort((a, b) => b.slice - a.slice)
})

const dailyRows = computed(() => data.value?.dailyUsage ?? [])

function formatPct(v: number) {
  return `${v.toFixed(1)}%`
}

function formatCost(v: number) {
  return `$${v.toFixed(2)}`
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}
</script>

<template>
  <main class="page">
    <header class="masthead">
      <h1>Claude team usage</h1>
      <p class="subtitle">Shared Max plan account · 3 developers</p>
    </header>

    <p v-if="status === 'pending'" class="notice">Loading…</p>
    <p v-else-if="error" class="notice notice--error">
      Failed to load team summary: {{ error.message }}
    </p>

    <template v-else>
      <section class="account-header">
        <div class="account-stat">
          <span class="account-stat__label">5-hour window</span>
          <span class="account-stat__value">{{ formatPct(num(header?.account_five_hour_pct)) }}</span>
          <span class="account-stat__reset">{{ formatCountdown(header?.five_hour_resets_at) }}</span>
        </div>
        <div class="account-stat">
          <span class="account-stat__label">7-day window</span>
          <span class="account-stat__value">{{ formatPct(num(header?.account_seven_day_pct)) }}</span>
          <span class="account-stat__reset">{{ formatCountdown(header?.seven_day_resets_at) }}</span>
        </div>
      </section>

      <p v-if="!userCards.length" class="notice">No usage data yet.</p>

      <section v-else class="cards">
        <article
          v-for="card in userCards"
          :key="card.userName"
          class="card"
          :class="[`card--${card.level}`, { 'card--idle': card.idle }]"
        >
          <div class="card__top">
            <h2 class="card__name">{{ card.userName }}</h2>
            <span class="card__slice">{{ formatPct(card.slice) }}</span>
          </div>
          <dl class="card__stats">
            <div>
              <dt>Window cost</dt>
              <dd>{{ formatCost(card.windowCost) }} <span class="hint">(API-equivalent)</span></dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>{{ card.inputTokens.toLocaleString() }} in / {{ card.outputTokens.toLocaleString() }} out</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{{ card.model }}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{{ formatLastSeen(card.recordedAt) }}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section class="daily">
        <h2>Daily peaks</h2>
        <table v-if="dailyRows.length">
          <thead>
            <tr>
              <th>Day</th>
              <th>User</th>
              <th>Peak 5h%</th>
              <th>Peak 7d%</th>
              <th>Cost <span class="hint">(API-equivalent)</span></th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dailyRows" :key="`${row.user_name}-${row.day}`">
              <td>{{ formatDay(row.day) }}</td>
              <td>{{ row.user_name }}</td>
              <td>{{ formatPct(num(row.peak_5h)) }}</td>
              <td>{{ formatPct(num(row.peak_7d)) }}</td>
              <td>{{ formatCost(num(row.total_cost_usd)) }}</td>
              <td>{{ row.session_count }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="notice">No daily data yet.</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #1a1a1a;
}

.masthead h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.subtitle {
  margin: 0.25rem 0 1.75rem;
  color: #666;
  font-size: 0.9rem;
}

.notice {
  color: #666;
  font-size: 0.95rem;
}

.notice--error {
  color: #b3261e;
}

.account-header {
  display: flex;
  gap: 1.5rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid #e2e2e2;
  margin-bottom: 1.75rem;
}

.account-stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.account-stat__label {
  font-size: 0.8rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.account-stat__value {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.1;
}

.account-stat__reset {
  font-size: 0.8rem;
  color: #888;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1rem;
  margin-bottom: 2.5rem;
}

.card {
  border: 1px solid #e2e2e2;
  border-left: 4px solid #8aa;
  border-radius: 6px;
  padding: 1rem 1.1rem;
  background: #fff;
  transition: opacity 0.2s ease;
}

.card--cool { border-left-color: #4a90d9; }
.card--amber { border-left-color: #d9a441; }
.card--red { border-left-color: #d94a4a; }

.card--idle {
  opacity: 0.5;
}

.card__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.6rem;
}

.card__name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.card__slice {
  font-size: 1.1rem;
  font-weight: 700;
}

.card__stats {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.85rem;
}

.card__stats > div {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.card__stats dt {
  color: #777;
}

.card__stats dd {
  margin: 0;
  text-align: right;
}

.hint {
  color: #999;
  font-weight: 400;
  font-size: 0.85em;
}

.daily h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

th, td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid #eee;
}

th {
  color: #666;
  font-weight: 600;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
</style>

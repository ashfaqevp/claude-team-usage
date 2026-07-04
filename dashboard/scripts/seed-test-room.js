// Dev-only tool: seeds a disposable fake Room so the dashboard's visual states
// (crowded grid, near-limit colouring, idle/dimmed cards) can be tested on demand,
// without waiting for real usage to land in those shapes. Not shipped, not imported
// by the extension or the dashboard app - run directly with `node scripts/seed-test-room.js`.
// Counterpart: scripts/delete-test-room.js (run it when you're done testing).
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './loadEnv.js'

loadEnv()

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY must be set (see dashboard/.env).')
  process.exit(1)
}

const TEST_ACCOUNT_EMAIL = 'ashfaq@iocod.com'

const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

const now = Date.now()
const minutes = (n) => new Date(now - n * 60_000).toISOString()
const hours = (n) => new Date(now - n * 60 * 60_000).toISOString()

// Shared window bounds for every row, like real snapshots from the same account at
// nearly the same time: five_hour_resets_at 90 minutes out puts the 5-hour window
// start at now - 3.5h, comfortably covering everything below (including the "idle"
// user's rows just past the 3-hour mark).
const FIVE_HOUR_RESETS_AT = new Date(now + 90 * 60_000).toISOString()
const SEVEN_DAY_RESETS_AT = new Date(now + 4 * 24 * 60 * 60_000).toISOString()

const MACHINE = 'seed-test-room.js'

// 4 members: Priya (heavy, active, near the account's 90% ceiling), Sam (moderate,
// active), Nina (light, active - lands near a 10% slice), Leo (idle - last seen ~3h
// ago). Each user is one session with two snapshots, so cost_usd is cumulative like
// a real session (session_cost_deltas() takes the increase, not the raw value).
const rows = [
  // Priya - heavy user, climbs toward the account's near-90% five_hour_pct.
  {
    user_name: 'Priya <priya@example.invalid>', machine: MACHINE, session_id: 'seed-priya-1',
    cost_usd: 18.00, five_hour_pct: 61, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 35, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Sonnet 5', input_tokens: 120_000, output_tokens: 3_000,
    recorded_at: minutes(40), account_email: TEST_ACCOUNT_EMAIL,
  },
  {
    user_name: 'Priya <priya@example.invalid>', machine: MACHINE, session_id: 'seed-priya-1',
    cost_usd: 42.50, five_hour_pct: 91, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 44, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Opus 4.8', input_tokens: 310_000, output_tokens: 8_500,
    recorded_at: minutes(2), account_email: TEST_ACCOUNT_EMAIL,
  },
  // Sam - moderate user, also active.
  {
    user_name: 'Sam <sam@example.invalid>', machine: MACHINE, session_id: 'seed-sam-1',
    cost_usd: 6.00, five_hour_pct: 58, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 32, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Sonnet 5', input_tokens: 45_000, output_tokens: 900,
    recorded_at: minutes(50), account_email: TEST_ACCOUNT_EMAIL,
  },
  {
    user_name: 'Sam <sam@example.invalid>', machine: MACHINE, session_id: 'seed-sam-1',
    cost_usd: 14.20, five_hour_pct: 88, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 40, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Sonnet 5', input_tokens: 98_000, output_tokens: 2_600,
    recorded_at: minutes(4), account_email: TEST_ACCOUNT_EMAIL,
  },
  // Nina - light user, active, should land with a small (~10%) slice of the limit.
  {
    user_name: 'Nina <nina@example.invalid>', machine: MACHINE, session_id: 'seed-nina-1',
    cost_usd: 0.80, five_hour_pct: 85, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 41, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Haiku 4.5', input_tokens: 8_000, output_tokens: 300,
    recorded_at: minutes(15), account_email: TEST_ACCOUNT_EMAIL,
  },
  {
    user_name: 'Nina <nina@example.invalid>', machine: MACHINE, session_id: 'seed-nina-1',
    cost_usd: 1.90, five_hour_pct: 90, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 44, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Haiku 4.5', input_tokens: 15_000, output_tokens: 700,
    recorded_at: minutes(3), account_email: TEST_ACCOUNT_EMAIL,
  },
  // Leo - idle: last seen ~3 hours ago, well past the 30-minute idle/dim threshold.
  {
    user_name: 'Leo <leo@example.invalid>', machine: MACHINE, session_id: 'seed-leo-1',
    cost_usd: 5.00, five_hour_pct: 70, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 33, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Sonnet 5', input_tokens: 30_000, output_tokens: 900,
    recorded_at: minutes(200), account_email: TEST_ACCOUNT_EMAIL,
  },
  {
    user_name: 'Leo <leo@example.invalid>', machine: MACHINE, session_id: 'seed-leo-1',
    cost_usd: 11.30, five_hour_pct: 75, five_hour_resets_at: FIVE_HOUR_RESETS_AT,
    seven_day_pct: 36, seven_day_resets_at: SEVEN_DAY_RESETS_AT,
    model: 'Sonnet 5', input_tokens: 52_000, output_tokens: 1_500,
    recorded_at: minutes(185), account_email: TEST_ACCOUNT_EMAIL,
  },
]

const { count: before, error: countError } = await client
  .from('usage_snapshots')
  .select('*', { count: 'exact', head: true })
  .eq('account_email', TEST_ACCOUNT_EMAIL)

if (countError) {
  console.error('Failed to count existing rows:', countError.message)
  process.exit(1)
}
console.log(`Rows for ${TEST_ACCOUNT_EMAIL} before seeding: ${before}`)

const { error: insertError } = await client.from('usage_snapshots').insert(rows)
if (insertError) {
  console.error('Failed to insert seed rows:', insertError.message)
  process.exit(1)
}

const { count: after, error: afterError } = await client
  .from('usage_snapshots')
  .select('*', { count: 'exact', head: true })
  .eq('account_email', TEST_ACCOUNT_EMAIL)

if (afterError) {
  console.error('Failed to count rows after seeding:', afterError.message)
  process.exit(1)
}

console.log(`Inserted ${rows.length} rows.`)
console.log(`Rows for ${TEST_ACCOUNT_EMAIL} after seeding: ${after}`)
console.log(`Run scripts/delete-test-room.js when done testing.`)

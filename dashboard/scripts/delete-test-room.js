// Dev-only counterpart to scripts/seed-test-room.js: deletes every row for the fake
// test Room so it doesn't linger as a stray Room in list_rooms(). Not shipped, not
// imported by the extension or the dashboard app.
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

const { count: before, error: countError } = await client
  .from('usage_snapshots')
  .select('*', { count: 'exact', head: true })
  .eq('account_email', TEST_ACCOUNT_EMAIL)

if (countError) {
  console.error('Failed to count existing rows:', countError.message)
  process.exit(1)
}
console.log(`Rows for ${TEST_ACCOUNT_EMAIL} before deleting: ${before}`)

const { error: deleteError } = await client
  .from('usage_snapshots')
  .delete()
  .eq('account_email', TEST_ACCOUNT_EMAIL)

if (deleteError) {
  console.error('Failed to delete test rows:', deleteError.message)
  process.exit(1)
}

const { count: after, error: afterError } = await client
  .from('usage_snapshots')
  .select('*', { count: 'exact', head: true })
  .eq('account_email', TEST_ACCOUNT_EMAIL)

if (afterError) {
  console.error('Failed to count rows after deleting:', afterError.message)
  process.exit(1)
}

console.log(`Rows for ${TEST_ACCOUNT_EMAIL} after deleting: ${after}`)

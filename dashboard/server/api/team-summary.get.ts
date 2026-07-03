// The only place the Supabase secret key is used. Runs server-side only (Nitro) —
// the client fetches this route and never talks to Supabase directly.
export default defineEventHandler(async (event) => {
  const { supabaseUrl, supabaseSecretKey } = useRuntimeConfig(event)

  if (!supabaseUrl || !supabaseSecretKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SUPABASE_URL / SUPABASE_SECRET_KEY are not configured on the server',
    })
  }

  const headers = {
    apikey: supabaseSecretKey,
    Authorization: `Bearer ${supabaseSecretKey}`,
  }

  const [teamSummary, latestPerUser, dailyUsage] = await Promise.all([
    $fetch(`${supabaseUrl}/rest/v1/rpc/get_team_window_summary`, {
      method: 'POST',
      headers,
      body: {},
    }),
    $fetch(`${supabaseUrl}/rest/v1/latest_per_user`, {
      headers,
      query: { select: '*' },
    }),
    $fetch(`${supabaseUrl}/rest/v1/daily_usage`, {
      headers,
      query: { select: '*', order: 'day.desc' },
    }),
  ])

  return { teamSummary, latestPerUser, dailyUsage }
})

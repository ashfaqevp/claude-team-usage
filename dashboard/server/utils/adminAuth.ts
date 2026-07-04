import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'

// Confirms the caller is signed in AND their verified email is in public.admins.
// Deliberately a single 403 for every failure mode (not signed in, signed in as
// someone not in admins, lookup error) - never reveals which case it was, and never
// a 401, so an unauthenticated probe of /api/admin/* learns nothing about whether
// admin accounts exist. Every /api/admin/* route calls this independently - none of
// them trust a check already performed by another route.
export async function requireAdminEmail(event: H3Event): Promise<string> {
  const user = await serverSupabaseUser(event).catch(() => null)
  const email = user?.email?.trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const client = serverSupabaseServiceRole(event)
  const { data, error } = await client.from('admins').select('email').eq('email', email).maybeSingle()

  if (error || !data) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  return email
}

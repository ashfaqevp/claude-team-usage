import { serverSupabaseServiceRole } from '#supabase/server'

// Lists every Room for the admin switcher. Checks adminhood independently (does not
// rely on any check performed elsewhere) - see server/utils/adminAuth.ts.
export default defineEventHandler(async (event) => {
  await requireAdminEmail(event)

  const client = serverSupabaseServiceRole(event)
  const { data, error } = await client.rpc('list_rooms')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `Failed to load Rooms: ${error.message}` })
  }

  return data ?? []
})

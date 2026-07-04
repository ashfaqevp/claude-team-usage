import { serverSupabaseUser } from '#supabase/server'

// The Room is scoped entirely from the verified session email below — never from
// anything the client sends. This, plus /api/room-name.post.ts, are the only server
// routes (besides /api/admin/*) that use the Supabase secret key (via
// getRoomPayload -> serverSupabaseServiceRole).
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  const email = user?.email?.trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }

  return getRoomPayload(event, email)
})

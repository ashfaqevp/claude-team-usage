import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'

// Lets the logged-in owner set/rename their own Room. The row to upsert is keyed by
// the verified session email, never a client-supplied one, so an owner can only ever
// touch their own Room.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  const email = user?.email?.trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }

  const body = await readBody<{ roomName?: string }>(event)
  const roomName = body?.roomName?.trim()

  if (!roomName) {
    throw createError({ statusCode: 400, statusMessage: 'roomName is required' })
  }

  const client = serverSupabaseServiceRole(event)

  const { error } = await client
    .from('rooms')
    .upsert({ claude_email: email, room_name: roomName }, { onConflict: 'claude_email' })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `Failed to save Room name: ${error.message}` })
  }

  return { roomName }
})

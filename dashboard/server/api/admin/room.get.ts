// Returns the same combined Room payload /api/my-room returns, but for an
// admin-chosen ?email= instead of the caller's own session email. Re-confirms
// adminhood independently of /api/admin/rooms.get.ts - the requested email is only
// ever trusted after that check passes.
export default defineEventHandler(async (event) => {
  await requireAdminEmail(event)

  const query = getQuery(event)
  const rawEmail = query.email
  // Match list_rooms()'s claude_email verbatim - do not re-normalize casing here,
  // or a Room whose stored account_email isn't already lowercase would silently
  // return empty (the account_email filters below would just miss).
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : ''

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' })
  }

  return getRoomPayload(event, email)
})

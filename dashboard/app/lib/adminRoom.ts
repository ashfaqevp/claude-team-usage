// A Room is identified by its Claude account email. To keep admin URLs clean and
// free of raw '@'/'.' segments, the email is carried in the route as a URL-safe
// base64 id. btoa/atob exist in both the browser and Nitro's Node runtime, and the
// email is ASCII, so this round-trips on the server (SSR) and client alike.
export function encodeRoomId(email: string): string {
  return btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeRoomId(id: string): string {
  try {
    return atob(id.replace(/-/g, '+').replace(/_/g, '/'))
  }
  catch {
    return ''
  }
}

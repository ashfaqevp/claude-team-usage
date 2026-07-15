# Claude Room — Dashboard

The web dashboard for [Claude Room](https://claude-room.vercel.app/): the shared view of
who's actually using a shared Claude Max or Team account.

**Live:** [claude-room.vercel.app/dashboard](https://claude-room.vercel.app/dashboard)

## What it's for

Claude Code reports usage per *account*, not per *person* — so on a shared account,
everyone sees the same 5-hour and 7-day percentage and nobody can tell whose sessions are
driving it. The [Claude Room VS Code extension](../extension/) measures each member's
usage on their own machine; this dashboard is where that comes back together as one
picture of the Room.

A **Room** is one shared Claude account. Its members are the people signed into it — they
join automatically by using the extension, with no invites to manage.

## Using it

1. Go to [claude-room.vercel.app/dashboard](https://claude-room.vercel.app/dashboard) and
   **sign in with GitHub**.
2. You'll land in the Room matching your Claude account. Sign-in is matched against the
   Room's account email on the server, so you only ever reach your own Room.
3. If it's a new Room, **name it** from the prompt on the overview page.

Data refreshes every 30 seconds while the page is open.

### What you'll see

- **Overview** — how much of the 5-hour and 7-day limit the Room has burned and how fast,
  each member's estimated slice with their cost, tokens, model and context, plus the share
  breakdown and daily activity.
- **Members** — the per-person view. Members idle for more than 30 minutes are dimmed.
- **History** — usage over time, day by day.
- **Settings** — rename the Room.

> **On cost figures:** everything is labeled *API-equivalent*. On a Max or Team plan
> these aren't real charges — they're the yardstick used to measure who consumed what
> share of the plan. Slices are proportional estimates derived from measured cost, not an
> official per-user meter.

## Empty dashboard?

Members appear once they've run a Claude Code session **with the extension installed**.
If someone is missing, they most likely haven't installed it yet — see the
[extension README](../extension/README.md) for setup.

## Development

Nuxt 4 + Tailwind + shadcn-vue. Requires `.env` with `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, and `SUPABASE_PUBLISHABLE_KEY` — see `.env.example`. Read
`CLAUDE.md` in this directory for architecture and conventions before changing anything.

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm preview  # preview the production build
```

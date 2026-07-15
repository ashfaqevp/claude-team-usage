# Claude Room

**Know your share of a shared Claude account.**

When several people share one Claude Max or Team account, Claude Code's status line shows
everyone the same number. It tells you the account is at 72% of its 5-hour limit — it
never tells you whether that's you, or the person sitting next to you.

Claude Room splits that one blended number into a per-person breakdown. You see your own
share in VS Code. Your team sees the whole picture on the dashboard.

**→ Dashboard: [claude-room.vercel.app/dashboard](https://claude-room.vercel.app/dashboard)**

---

## Quick start

1. **Install** this extension and reload VS Code.
2. **Use Claude Code like you normally would.** Your usage appears in the status bar
   within a minute of your next session.
3. **Set your name** *(optional)* — your usage is labeled with your git identity. If your
   team won't recognize it, set `claudeUsage.userNameOverride` in VS Code settings.

There's no sign-up, no API key, and no configuration. The extension detects which Claude
account you're signed into and wires itself into Claude Code automatically.

## What a "Room" is

A **Room** is one shared Claude account. Its members are the people signed into it.

You never create a Room or join one. The extension reads which Claude account you're
logged into on this machine and places you in that Room. Everyone on the same account
lands in the same Room automatically. People on other accounts never see your usage, and
you never see theirs.

## What you'll see

### In VS Code

A **status bar item** shows your live share of the shared 5-hour limit, and turns amber
then red as the Room approaches its limit — so you notice before you're cut off.

Click it (or run **`Claude Room: Show my usage`** from the command palette) to open the
panel:

- Your estimated slice of the 5-hour limit, next to where the whole Room sits
- Your cost, tokens, sessions, and current model for the active window
- How full each of your sessions' context windows are
- A day-by-day table of your own activity
- A link straight to the Room dashboard

### On the dashboard

The Room owner signs in with GitHub at
**[claude-room.vercel.app/dashboard](https://claude-room.vercel.app/dashboard)** and gets
the view no single machine can produce:

| Page | What it answers |
|---|---|
| **Overview** | How much of the limit the Room has burned, how fast, and who's driving it |
| **Members** | Each person's slice, cost, tokens, model — with idle members dimmed |
| **History** | Usage over time, day by day |
| **Settings** | Name your Room |

Sign-in is matched against the Room's Claude account email on the server, so an owner only
ever reaches their own Room. You can jump there from the panel header, or run
**`Claude Room: Open Room dashboard`**.

## What people use it for

**"Who used up the 5-hour limit?"** The classic shared-account argument. Instead of
guessing, the Room dashboard shows the split — usually one long agentic session, not the
person everyone suspected.

**"Can I start this big refactor right now?"** Check the status bar first. If the Room is
at 85% with two hours until reset, you'll know to save the heavy work rather than getting
cut off halfway through.

**"Is one account still enough for us?"** Watch the history over a few weeks. A Room that
regularly hits its ceiling is telling you it's time for another seat — and the member
breakdown shows who needs it most.

**"Are we sharing this fairly?"** Not to police anyone, but because a shared limit is a
shared resource. When everyone can see the split, heavy sessions get scheduled around each
other instead of colliding.

**"Which model is eating our budget?"** The member view shows each person's current model
and cost, which usually makes it obvious where switching to a lighter model would pay off.

> **About the cost figures:** everything is labeled *API-equivalent*. On a Max or Team
> plan these are **not real charges** — nobody is billed for them. They're the yardstick
> used to measure who consumed which share of the plan.

## What data is collected

**Usage measurements only.** Never your prompts, your code, your files, your file paths,
or anything else from your conversations or workspace. None of that is read, logged, or
sent anywhere.

**On your machine** (`~/.claude/team-usage/local-log.jsonl`): cost, token counts, 5h/7d
percentages and reset times, per-session context usage, model name, session id, and
timestamp.

**Shared with your Room:** those same measurements, plus the label identifying you, your
machine's name, and your Claude account's email — the last of which is what groups you
into the right Room. In full: `user_name`, `machine`, `account_email`, `session_id`,
`cost_usd`, `five_hour_pct`, `five_hour_resets_at`, `seven_day_pct`,
`seven_day_resets_at`, `model`, `input_tokens`, `output_tokens`, `context_used_pct`,
`recorded_at`.

The credentials shipped with this extension can only **add** snapshots and read back
**aggregates** — they cannot read anyone's raw rows, including yours.

**Want to keep everything local?** Clear `claudeUsage.supabaseUrl` in VS Code settings.
Sharing stops immediately, the status bar and panel keep working from your local log, and
you simply won't appear on the Room dashboard.

## Settings

| Setting | What it's for |
|---|---|
| `claudeUsage.userNameOverride` | The name your teammates see next to your usage. Leave empty to use your git identity. |
| `claudeUsage.supabaseUrl` | Where your Room lives. Pre-filled — clear it to stop sharing and go local-only. |
| `claudeUsage.supabaseAnonKey` | Your Room's publishable key. Pre-filled — you shouldn't need to touch it. |

## Questions you might have

**Nothing shows up in my status bar.** Claude Room reports on Claude Code sessions, so it
stays quiet until you've run one. Give it a minute after your first session — it refreshes
every 30 seconds.

**A teammate is missing from the dashboard.** They appear once they've run a Claude Code
session *with this extension installed*. Sessions on machines without it still count
against the shared limit but can't be attributed to anyone.

**It says my account is "unknown".** The extension couldn't read which Claude account
you're signed into, so it can't tell which Room you belong to. Sign in to Claude Code,
then reload VS Code.

**How accurate are the slices?** They're informed estimates, not an official meter. Claude
reports usage per *account*, never per person — so each member's share is derived
proportionally from their measured cost within the current window. Good enough to settle
"who used the limit," not a billing-grade audit.

**Does it work offline?** Yes. The panel and status bar read from your local log and never
need the network. If sharing can't reach your Room, snapshots queue up locally and catch up
later — nothing is lost and nothing stops working.

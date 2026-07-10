<script setup lang="ts">
// Public marketing landing page (the sign-in UI moved to /login). This page is
// deliberately reachable while signed in — a signed-in DIRECT visit stays here
// (useSupabaseUser() is already populated from the cookie at SSR, so no null->user
// transition fires the watch below). Only an OAuth return, which lands back here as
// `/?code=...` and transitions null->user client-side, gets forwarded to /dashboard.
// Mirrors the full-navigation redirect used in login.vue / confirm.vue.
const user = useSupabaseUser()

watch(user, (u) => {
  if (u) window.location.href = '/dashboard'
})

useHead({
  title: 'Claude Room — Split your shared Claude usage, per person',
  meta: [
    {
      name: 'description',
      content:
        'Claude Code shows one usage number for a whole shared account. Claude Room breaks it down per person, so you can see whose sessions are driving the limit before you hit it.',
    },
  ],
})
</script>

<template>
  <div class="cr-landing">
    <!-- NAV -->
    <header class="cr-header">
      <nav class="cr-nav">
        <a href="#top" style="display:flex; align-items:center; gap:11px;">
          <BrandLogo :size="30" wordmark-class="text-xl" />
        </a>
        <div class="cr-nav-links" style="display:flex; align-items:center; gap:26px; font-size:14px;">
          <a href="#features" class="nl">Features</a>
          <a href="#how" class="nl">How it works</a>
          <a href="#extension" class="nl">Extension</a>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <a href="#coffee" class="btnp cr-coffee" style="display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:9px; font-weight:600; font-size:13.5px;">☕ Buy me a coffee</a>
          <NuxtLink v-if="!user" to="/login" class="btnp" style="display:inline-flex; align-items:center; gap:7px; background:var(--surface); color:var(--ink); border:1px solid var(--border); padding:9px 16px; border-radius:9px; font-weight:500; font-size:13.5px;">Sign in</NuxtLink>
          <NuxtLink v-else to="/dashboard" class="btnp" style="display:inline-flex; align-items:center; gap:7px; background:var(--accent); color:#fff; padding:9px 16px; border-radius:9px; font-weight:500; font-size:13.5px;">Go to dashboard</NuxtLink>
        </div>
      </nav>
    </header>
    <span id="top"></span>

    <!-- HERO -->
    <section style="max-width:1200px; margin:0 auto; padding:80px 32px 40px; text-align:center;">
      <div style="display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--accent-ink); background:var(--accent-soft); border:1px solid color-mix(in srgb, var(--accent) 30%, transparent); padding:6px 13px; border-radius:999px;">
        <span style="width:6px; height:6px; border-radius:50%; background:var(--accent);"></span>
        For teams sharing one Claude Max or Team account
      </div>
      <h1 class="serif cr-h1" style="font-weight:500; font-size:66px; line-height:1.03; letter-spacing:-.025em; margin-top:24px; text-wrap:balance;">One shared account.<br>Everyone's usage, <span style="font-style:italic; color:var(--accent-ink);">finally split.</span></h1>
      <p style="font-size:19px; line-height:1.55; color:var(--ink2); margin:22px auto 0; max-width:35em;">Claude Code shows a single usage number for the whole account — the same on every machine. Claude Room breaks it down per person, so you can see exactly whose sessions are driving the limit before you hit it.</p>
      <div style="display:flex; gap:12px; justify-content:center; margin-top:32px; flex-wrap:wrap;">
        <a href="#install" class="btnp" style="display:inline-flex; align-items:center; gap:9px; background:var(--accent); color:#fff; padding:14px 24px; border-radius:10px; font-weight:500; font-size:15.5px;">Get the extension
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 8h8M8 4l4 4-4 4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <NuxtLink to="/dashboard" style="display:inline-flex; align-items:center; gap:9px; background:var(--surface); color:var(--ink); padding:14px 24px; border-radius:10px; font-weight:500; font-size:15.5px; border:1px solid var(--border);">See a live dashboard</NuxtLink>
      </div>
      <p class="mono" style="font-size:12.5px; color:var(--ink3); margin-top:18px;">zero config · works offline · free &amp; open source</p>

      <!-- HERO PRODUCT IMAGE: dashboard in a browser frame -->
      <div style="margin-top:56px; border-radius:16px; overflow:hidden; border:1px solid var(--border); box-shadow:var(--shadow); background:var(--surface); text-align:left;">
        <div style="height:40px; background:var(--surface2); border-bottom:1px solid var(--border2); display:flex; align-items:center; gap:8px; padding:0 15px;">
          <span style="width:11px; height:11px; border-radius:50%; background:#FF5F57;"></span><span style="width:11px; height:11px; border-radius:50%; background:#FEBC2E;"></span><span style="width:11px; height:11px; border-radius:50%; background:#28C840;"></span>
          <span class="mono" style="margin-left:14px; font-size:11.5px; color:var(--ink3); background:var(--bg); border:1px solid var(--border2); padding:4px 14px; border-radius:7px;">claude-room.app/dashboard</span>
        </div>
        <div style="padding:22px; background:var(--bg);">
          <!-- window head -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:9px;"><span class="serif" style="font-size:19px;">Acme Engineering</span><span class="mono" style="font-size:10.5px; color:var(--ink3); border:1px solid var(--border); padding:2px 7px; border-radius:6px;">team@acme.dev</span></div>
            <span class="mono" style="font-size:12px; color:var(--ink3);">51% of 5h · $40.74</span>
          </div>
          <!-- top stats -->
          <div class="cr-hero-preview-top" style="display:grid; grid-template-columns:1.5fr 1fr; gap:12px; margin-bottom:12px;">
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px;">
              <div class="mono" style="font-size:10px; letter-spacing:.06em; color:var(--ink3); text-transform:uppercase;">Shared 5-hour window</div>
              <div style="display:flex; align-items:baseline; gap:10px; margin-top:6px;"><span class="mono" style="font-size:32px; font-weight:500;">51%</span><span style="font-size:11px; color:var(--clay); background:var(--accent-soft); padding:3px 9px; border-radius:99px;">on pace</span></div>
              <div style="position:relative; height:8px; background:var(--track); border-radius:99px; margin-top:14px;"><div style="width:51%; height:100%; background:var(--accent); border-radius:99px;"></div><div style="position:absolute; left:56%; top:-3px; bottom:-3px; width:2px; background:var(--ink2);"></div></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px;">
              <div class="mono" style="font-size:10px; letter-spacing:.06em; color:var(--ink3); text-transform:uppercase;">7-day window</div>
              <div class="mono" style="font-size:26px; font-weight:500; margin-top:6px;">23%</div>
              <div style="height:8px; background:var(--track); border-radius:99px; overflow:hidden; margin-top:14px;"><div style="width:23%; height:100%; background:var(--plum);"></div></div>
            </div>
          </div>
          <!-- member cards -->
          <div class="cr-members" style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
            <div style="background:var(--surface); border:1px solid var(--border); border-left:3px solid var(--green); border-radius:12px; padding:15px;">
              <div style="display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:7px;"><span style="width:24px; height:24px; border-radius:7px; background:var(--green); color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600;">ra</span><span style="font-weight:500; font-size:13.5px;">rashid</span></div><span class="mono" style="font-size:14px; font-weight:500;">27%</span></div>
              <div style="height:4px; background:var(--track); border-radius:99px; overflow:hidden; margin:12px 0;"><div style="width:53%; height:100%; background:var(--green);"></div></div>
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--ink2);">cost</span><span class="mono">$21.40</span></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-left:3px solid var(--blue); border-radius:12px; padding:15px;">
              <div style="display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:7px;"><span style="width:24px; height:24px; border-radius:7px; background:var(--blue); color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600;">ju</span><span style="font-weight:500; font-size:13.5px;">junior1</span></div><span class="mono" style="font-size:14px; font-weight:500;">16%</span></div>
              <div style="height:4px; background:var(--track); border-radius:99px; overflow:hidden; margin:12px 0;"><div style="width:32%; height:100%; background:var(--blue);"></div></div>
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--ink2);">cost</span><span class="mono">$13.10</span></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-left:3px solid var(--clay); border-radius:12px; padding:15px; opacity:.62;">
              <div style="display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:7px;"><span style="width:24px; height:24px; border-radius:7px; background:var(--clay); color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600;">de</span><span style="font-weight:500; font-size:13.5px;">devon</span></div><span class="mono" style="font-size:14px; font-weight:500;">8%</span></div>
              <div style="height:4px; background:var(--track); border-radius:99px; overflow:hidden; margin:12px 0;"><div style="width:15%; height:100%; background:var(--clay);"></div></div>
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--ink2);">cost</span><span class="mono">$6.24</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- PROBLEM -->
    <section style="max-width:1200px; margin:0 auto; padding:72px 32px;">
      <div class="cr-grid2" style="display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:center;">
        <div>
          <div class="mono" style="font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--accent-ink);">The problem</div>
          <h2 class="serif" style="font-weight:500; font-size:40px; line-height:1.1; letter-spacing:-.02em; margin-top:14px;">Shared limits, invisible people.</h2>
          <p style="font-size:17px; line-height:1.6; color:var(--ink2); margin-top:18px;">Share one Claude account and the status line shows <em>one</em> combined percentage — identical on every machine, with no way to tell whose sessions are driving it. When the account gets throttled before reset, nobody knows why, and nobody can plan around it.</p>
        </div>
        <div style="background:var(--dark); border-radius:16px; padding:28px; color:#EDEAE3; box-shadow:var(--shadow);">
          <div class="mono" style="font-size:11.5px; color:#8F887C; margin-bottom:16px;">~ every machine · same reading</div>
          <div class="mono" style="font-size:14px; line-height:2.1; color:#CFC9BE;">
            <div><span style="color:#8FA99C;">rashid</span>&nbsp;&nbsp;&nbsp;5h <span style="color:#fff;">51%</span> · 7d 23%</div>
            <div><span style="color:#8FA99C;">junior1</span>&nbsp;&nbsp;5h <span style="color:#fff;">51%</span> · 7d 23%</div>
            <div><span style="color:#8FA99C;">devon</span>&nbsp;&nbsp;&nbsp;&nbsp;5h <span style="color:#fff;">51%</span> · 7d 23%</div>
          </div>
          <div style="margin-top:18px; padding-top:16px; border-top:1px solid #34322C; font-size:13px; color:#8F887C; line-height:1.55;">Three people, one number. Anthropic doesn't break it down — so on your own, neither can you.</div>
        </div>
      </div>
    </section>

    <!-- FEATURES (BENTO) -->
    <section id="features" style="max-width:1200px; margin:0 auto; padding:40px 32px 72px;">
      <div style="text-align:center; max-width:34em; margin:0 auto 40px;">
        <div class="mono" style="font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--accent-ink);">What you get</div>
        <h2 class="serif" style="font-weight:500; font-size:40px; line-height:1.1; letter-spacing:-.02em; margin-top:12px;">Everything the status line can't tell you.</h2>
      </div>

      <div class="cr-bento" style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px;">
        <!-- big: per-member -->
        <div class="cr-span2" style="grid-column:span 2; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:28px; box-shadow:var(--shadow); display:flex; gap:28px; align-items:center;">
          <div style="flex:1;">
            <h3 class="serif" style="font-size:23px; font-weight:500;">Per-member split of the shared limit</h3>
            <p style="font-size:14.5px; line-height:1.6; color:var(--ink2); margin-top:10px;">Each person's estimated share of the account's real 5-hour and 7-day limits — derived from their cost inside the window. See who's driving usage, without ranking or blaming anyone.</p>
          </div>
          <svg width="150" height="150" viewBox="0 0 42 42" style="flex-shrink:0;">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--track)" stroke-width="7"/>
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--green)" stroke-width="7" stroke-dasharray="53 47" stroke-dashoffset="25" transform="rotate(-90 21 21)"/>
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--blue)" stroke-width="7" stroke-dasharray="32 68" stroke-dashoffset="-28" transform="rotate(-90 21 21)"/>
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--clay)" stroke-width="7" stroke-dasharray="15 85" stroke-dashoffset="-60" transform="rotate(-90 21 21)"/>
            <text x="21" y="22.6" text-anchor="middle" class="mono" style="font-size:5px; font-weight:500; fill:var(--ink);">3 members</text>
          </svg>
        </div>
        <!-- pace -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:28px; box-shadow:var(--shadow);">
          <div style="display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--clay); background:var(--accent-soft); padding:4px 10px; border-radius:99px; font-weight:500;"><span style="width:6px; height:6px; border-radius:50%; background:var(--clay);"></span>on pace</div>
          <h3 class="serif" style="font-size:21px; font-weight:500; margin-top:14px;">Pace, not just percent</h3>
          <p style="font-size:14px; line-height:1.55; color:var(--ink2); margin-top:8px;">Know whether you're ahead of, on, or within pace for the window — so a reset never blindsides the team.</p>
        </div>
        <!-- privacy -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:28px; box-shadow:var(--shadow);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V5l7-3z" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h3 class="serif" style="font-size:21px; font-weight:500; margin-top:14px;">Numbers only, never content</h3>
          <p style="font-size:14px; line-height:1.55; color:var(--ink2); margin-top:8px;">Cost, tokens, and percentages leave your machine — prompts, code, and files never do. By design, not policy.</p>
        </div>
        <!-- zero config -->
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:28px; box-shadow:var(--shadow);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="3.2" stroke="var(--accent)" stroke-width="1.5"/></svg>
          <h3 class="serif" style="font-size:21px; font-weight:500; margin-top:14px;">Zero configuration</h3>
          <p style="font-size:14px; line-height:1.55; color:var(--ink2); margin-top:8px;">Install the extension and it wires Claude Code's status-line hook itself. Nothing to set up, works offline first.</p>
        </div>
        <!-- history -->
        <div class="cr-span2" style="grid-column:span 2; background:var(--dark); border:1px solid var(--dark); border-radius:18px; padding:28px; box-shadow:var(--shadow); color:#EDEAE3; display:flex; gap:28px; align-items:center;">
          <div style="flex:1;">
            <h3 class="serif" style="font-size:23px; font-weight:500;">History that adds up correctly</h3>
            <p style="font-size:14.5px; line-height:1.6; color:#B7B1A6; margin-top:10px;">Delta-based accounting per session and per window — resumed sessions, parallel tabs, and window boundaries are all handled, so daily peaks and costs are trustworthy.</p>
          </div>
          <div style="display:flex; gap:8px; align-items:flex-end; height:96px;">
            <div style="width:20px; height:34px; background:#4A4640; border-radius:4px;"></div>
            <div style="width:20px; height:52px; background:#5B6B62; border-radius:4px;"></div>
            <div style="width:20px; height:70px; background:var(--green); border-radius:4px;"></div>
            <div style="width:20px; height:96px; background:var(--accent); border-radius:4px;"></div>
            <div style="width:20px; height:44px; background:#5B6B62; border-radius:4px;"></div>
            <div style="width:20px; height:62px; background:#5B6B62; border-radius:4px;"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section id="how" style="border-top:1px solid var(--border); background:var(--bg2);">
      <div style="max-width:1200px; margin:0 auto; padding:76px 32px;">
        <div class="mono" style="font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink3);">How it works</div>
        <h2 class="serif" style="font-weight:500; font-size:40px; line-height:1.1; letter-spacing:-.02em; margin-top:12px; max-width:18em;">From status line to your room, in three steps.</h2>
        <div class="cr-grid3" style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:44px;">
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:26px; box-shadow:var(--shadow);">
            <div class="mono" style="width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent-ink); display:flex; align-items:center; justify-content:center; font-weight:500;">1</div>
            <h3 class="serif" style="font-size:20px; font-weight:500; margin-top:18px;">Install the extension</h3>
            <p style="font-size:14.5px; line-height:1.55; color:var(--ink2); margin-top:8px;">Each person adds the VS Code extension. It hooks into Claude Code automatically — no config, no account setup.</p>
          </div>
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:26px; box-shadow:var(--shadow);">
            <div class="mono" style="width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent-ink); display:flex; align-items:center; justify-content:center; font-weight:500;">2</div>
            <h3 class="serif" style="font-size:20px; font-weight:500; margin-top:18px;">It reads the real numbers</h3>
            <p style="font-size:14.5px; line-height:1.55; color:var(--ink2); margin-top:8px;">On every render it captures Claude Code's official cost and rate-limit fields, then syncs only aggregates to your Room.</p>
          </div>
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:26px; box-shadow:var(--shadow);">
            <div class="mono" style="width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent-ink); display:flex; align-items:center; justify-content:center; font-weight:500;">3</div>
            <h3 class="serif" style="font-size:20px; font-weight:500; margin-top:18px;">See your room</h3>
            <p style="font-size:14.5px; line-height:1.55; color:var(--ink2); margin-top:8px;">Your slice shows right in VS Code. The account owner signs in to the dashboard for the full per-member breakdown.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- EXTENSION SHOWCASE -->
    <section id="extension" style="border-top:1px solid var(--border);">
      <div style="max-width:1200px; margin:0 auto; padding:76px 32px;">
        <div class="cr-grid2" style="display:grid; grid-template-columns:0.9fr 1.1fr; gap:48px; align-items:center;">
          <div>
            <div class="mono" style="font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--accent-ink);">In your editor</div>
            <h2 class="serif" style="font-weight:500; font-size:38px; line-height:1.12; letter-spacing:-.02em; margin-top:14px;">Your slice, without leaving VS Code.</h2>
            <p style="font-size:16.5px; line-height:1.6; color:var(--ink2); margin-top:18px;">A live status-bar item and a full panel: your share of the room, the team's pace, your cost and tokens this window, per-session context, and recent activity — all scoped to <em>your</em> room, never the account-wide blend.</p>
            <a href="#install" style="display:inline-flex; align-items:center; gap:8px; margin-top:24px; font-weight:500; font-size:15px; border:1px solid var(--border); background:var(--surface); color:var(--ink); padding:12px 20px; border-radius:10px;">Explore the panel
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </div>
          <!-- editor frame mock -->
          <div style="border-radius:14px; overflow:hidden; border:1px solid #0A0A0A; box-shadow:var(--shadow);">
            <div style="height:34px; background:#1A1A1A; display:flex; align-items:center; gap:7px; padding:0 13px;"><span style="width:10px; height:10px; border-radius:50%; background:#FF5F57;"></span><span style="width:10px; height:10px; border-radius:50%; background:#FEBC2E;"></span><span style="width:10px; height:10px; border-radius:50%; background:#28C840;"></span></div>
            <div style="display:flex; background:#1E1E1E; height:290px;">
              <div class="mono" style="flex:1; padding:16px 18px; font-size:11.5px; line-height:1.9; color:#575757;">
                <div>14 <span style="color:#8FA99C;">function</span> split(rows) {</div>
                <div>15 &nbsp;&nbsp;<span style="color:#8FA99C;">return</span> deltas(rows)</div>
                <div>16 }</div>
                <div style="margin-top:14px; color:#6F6F6F;">esc · <span style="color:#E08A66;">Sonnet 4.6</span></div>
              </div>
              <div style="width:220px; background:#232220; border-left:1px solid #000; padding:14px; color:#D2CEC6;">
                <div style="display:flex; align-items:center; gap:7px;"><svg width="14" height="14" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="13" fill="#E08A66"/><g transform="rotate(-90 24 24)"><circle cx="24" cy="24" r="15.915" fill="none" stroke="#232220" stroke-width="7" stroke-dasharray="44 56"/></g></svg><span class="mono" style="font-size:9.5px; letter-spacing:.1em; color:#9A948A;">CLAUDE ROOM</span></div>
                <div style="font-size:12.5px; margin-top:12px; line-height:1.4;">You're at <span class="mono" style="color:#E8A183;">27%</span> of the shared 5h limit</div>
                <div style="margin-top:12px;"><div style="display:flex; justify-content:space-between; font-size:10px; color:#9A948A; margin-bottom:5px;"><span>Room 5h</span><span class="mono">51%</span></div><div style="position:relative; height:6px; background:#37332D; border-radius:99px;"><div style="width:51%; height:100%; background:#E08A66; border-radius:99px;"></div><div style="position:absolute; left:56%; top:-2px; bottom:-2px; width:2px; background:#D4A05E;"></div></div></div>
                <div style="margin-top:12px; display:flex; align-items:center; gap:10px; background:#2A2622; border:1px solid #3A362F; border-radius:9px; padding:10px;">
                  <svg width="42" height="42" viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.915" fill="none" stroke="#37332D" stroke-width="7"/><circle cx="21" cy="21" r="15.915" fill="none" stroke="#E08A66" stroke-width="7" stroke-dasharray="53 47" stroke-dashoffset="25" transform="rotate(-90 21 21)"/><text x="21" y="24" text-anchor="middle" class="mono" style="font-size:8px; fill:#F1EDE5;">53%</text></svg>
                  <div style="font-size:11px; color:#9A948A; line-height:1.4;">your share<br>this window</div>
                </div>
              </div>
            </div>
            <div class="mono" style="height:24px; background:#D97757; display:flex; align-items:center; padding:0 12px; font-size:10.5px; color:#fff; gap:12px;"><span>Room 5h 51% · you 27%</span><span style="opacity:.85;">on pace</span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- COFFEE / PRICING -->
    <section id="coffee" style="border-top:1px solid var(--border); background:var(--bg2);">
      <div id="install" style="max-width:1200px; margin:0 auto; padding:80px 32px;">
        <div class="cr-grid2" style="background:var(--dark); border-radius:22px; padding:52px 48px; color:#EDEAE3; box-shadow:var(--shadow); display:grid; grid-template-columns:1.2fr 0.8fr; gap:48px; align-items:center;">
          <div>
            <div class="mono" style="font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:#8FA99C;">Free &amp; open source</div>
            <h2 class="serif" style="font-weight:500; font-size:40px; line-height:1.08; letter-spacing:-.02em; margin-top:14px;">Install it today. Split your usage tonight.</h2>
            <p style="font-size:16px; line-height:1.6; color:#B7B1A6; margin-top:16px; max-width:32em;">Claude Room is free and open source — no seats, no plan, no catch. If it saves your team a headache, the nicest thing you can do is buy me a coffee.</p>
            <div style="display:flex; gap:12px; margin-top:28px; flex-wrap:wrap;">
              <a href="#top" class="btnp" style="display:inline-flex; align-items:center; gap:9px; background:var(--accent); color:#fff; padding:14px 24px; border-radius:11px; font-weight:500; font-size:15.5px;">Get the extension
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 8h8M8 4l4 4-4 4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
              <a href="#top" class="btnp" style="display:inline-flex; align-items:center; gap:9px; background:#211F1C; color:#EDEAE3; padding:14px 22px; border-radius:11px; font-weight:500; font-size:15px; border:1px solid #34322C;">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="#EDEAE3"><path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2 .4-2.5-.5-2.7-1-.1-.3-.6-1-1-1.2-.3-.2-.8-.6 0-.6.7 0 1.2.7 1.4 1 .8 1.3 2 1 2.6.7.1-.6.3-1 .6-1.2-2-.2-3.7-1-3.7-4.4 0-1 .3-1.7.9-2.4-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.4.9a8.2 8.2 0 0 1 4.4 0c1.7-1.1 2.4-.9 2.4-.9.5 1.2.2 2.1.1 2.3.6.7.9 1.4.9 2.4 0 3.4-2 4.2-4 4.4.4.3.6.8.6 1.6v2.4c0 .2.2.5.6.4A8 8 0 0 0 8 .2z"/></svg>
                Star on GitHub
              </a>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; gap:16px; background:#211F1C; border:1px solid #34322C; border-radius:18px; padding:32px;">
            <div style="font-size:52px;">☕</div>
            <div style="text-align:center;"><div class="serif" style="font-size:22px;">Enjoying Claude Room?</div><div style="font-size:13.5px; color:#8F887C; margin-top:4px;">A coffee keeps it maintained.</div></div>
            <a href="#coffee" class="btnp cr-coffee" style="display:inline-flex; align-items:center; gap:9px; padding:13px 22px; border-radius:11px; font-weight:600; font-size:15px;">☕ Buy me a coffee</a>
          </div>
        </div>
      </div>
    </section>

    <!-- FOOTER -->
    <footer style="border-top:1px solid var(--border);">
      <div class="cr-footer" style="max-width:1200px; margin:0 auto; padding:40px 32px; display:flex; align-items:center; justify-content:space-between; gap:24px; flex-wrap:wrap;">
        <BrandLogo :size="26" wordmark-class="text-base" />
        <div style="display:flex; gap:22px; font-size:13.5px;">
          <NuxtLink to="/dashboard" class="nl">Dashboard</NuxtLink>
          <a href="#extension" class="nl">Extension</a>
          <a href="#coffee" class="nl">Buy me a coffee</a>
        </div>
        <div style="font-size:12px; color:var(--ink3); max-width:24em; text-align:right;">An independent tool for Claude Code teams. Not affiliated with or endorsed by Anthropic.</div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Self-contained warm-paper palette for the landing, defined on the wrapper so the
   CSS custom properties inherit down to every inline `style="...var(--x)..."` in the
   template WITHOUT leaking into the neutral-gray dashboard/admin pages. Dark-only, to
   match the rest of the (forced-dark) product — the source design's light theme and
   its runtime theme toggle are intentionally dropped. Values are the design's dark
   palette; type inherits the app-wide stack (serif -> Newsreader, sans -> IBM Plex
   Sans, mono -> IBM Plex Mono), so no external font request beyond what the app
   already loads. */
.cr-landing {
  --bg: #171613;
  --bg2: #1E1D19;
  --surface: #232220;
  --surface2: #1C1B18;
  --ink: #EFECE4;
  --ink2: #A9A395;
  --ink3: #726C61;
  --border: #33302A;
  --border2: #2B2925;
  --accent: #E08A66;
  --accent-ink: #EBA383;
  --accent-soft: rgba(224, 138, 102, 0.14);
  --blue: #7B9AD0;
  --plum: #B48AB8;
  --clay: #CC9A63;
  --green: #6FBE9F;
  --track: #302D28;
  --dark: #111008;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 34px 66px -30px rgba(0, 0, 0, 0.7);

  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  /* Keep the fixed-width editor/dashboard mocks from ever pushing the page wide. */
  overflow-x: clip;
}

.cr-landing :deep(.mono),
.cr-landing .mono {
  font-family: var(--font-mono);
}
.cr-landing .serif {
  font-family: var(--font-serif);
}
.cr-landing a {
  color: var(--accent-ink);
  text-decoration: none;
}
.cr-landing a:hover {
  opacity: 0.82;
}
.cr-landing ::selection {
  background: var(--accent-soft);
}
.cr-landing .nl {
  color: var(--ink2);
}
.cr-landing .nl:hover {
  color: var(--ink);
  opacity: 1;
}
.cr-landing .btnp:hover {
  opacity: 0.9 !important;
}
.cr-landing .cr-coffee {
  background: #FFDD00;
  color: #26241F;
}

.cr-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
.cr-nav {
  max-width: 1200px;
  margin: 0 auto;
  padding: 15px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

/* The source design is desktop-first with hard-coded multi-column grids; collapse
   them so the page never scrolls horizontally on phones/tablets. Inline
   grid-template-columns has higher specificity, hence !important. */
@media (max-width: 880px) {
  .cr-landing .cr-nav-links {
    display: none !important;
  }
  .cr-landing .cr-grid2,
  .cr-landing .cr-grid3,
  .cr-landing .cr-bento,
  .cr-landing .cr-hero-preview-top,
  .cr-landing .cr-members {
    grid-template-columns: 1fr !important;
  }
  .cr-landing .cr-span2 {
    grid-column: auto !important;
  }
  .cr-landing .cr-h1 {
    font-size: 42px !important;
  }
  .cr-footer {
    justify-content: center !important;
    text-align: center !important;
  }
}
</style>

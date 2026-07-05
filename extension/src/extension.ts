import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  Snapshot,
  readLocalLog,
  summarizeCurrentWindow,
  dailyPeaks,
  latestModel,
  formatUsd,
  formatPct,
  formatCountdown,
} from './usage';
import { syncLocalLog } from './sync';
import { fetchTeamSlice, fetchRoomName, TeamSlice } from './team';
import { resolveIdentity } from './identity';
import { readClaudeAccountEmail } from './claudeAccount';

const TEAM_USAGE_DIR = path.join(os.homedir(), '.claude', 'team-usage');
const LOGGER_DEST = path.join(TEAM_USAGE_DIR, 'usage-logger.js');
const LOCAL_LOG_FILE = path.join(TEAM_USAGE_DIR, 'local-log.jsonl');
const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

const STATUS_BAR_UPDATE_INTERVAL_MS = 30_000;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  installLogger(context);
  await wireStatusLineSetting(context);

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'claudeTeamUsage.showUsage';
  context.subscriptions.push(statusBarItem);

  const refresh = () => {
    updateStatusBar(statusBarItem).catch(() => {});
    syncLocalLog(context, LOCAL_LOG_FILE).catch(() => {});
  };
  refresh();
  const interval = setInterval(refresh, STATUS_BAR_UPDATE_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  statusBarItem.show();

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTeamUsage.showUsage', () => {
      showUsagePanel(context);
    })
  );
}

export function deactivate(): void {
  // Interval and status bar item are disposed via context.subscriptions.
}

/** Copy the canonical logger from the extension bundle into ~/.claude/team-usage/. */
function installLogger(context: vscode.ExtensionContext): void {
  try {
    fs.mkdirSync(TEAM_USAGE_DIR, { recursive: true });
    const source = context.asAbsolutePath(path.join('media', 'usage-logger.js'));
    fs.copyFileSync(source, LOGGER_DEST);
  } catch (err) {
    vscode.window.showWarningMessage(
      `Claude Team Usage: failed to install the status-line logger — ${String(err)}`
    );
  }
}

function loggerCommandLine(): string {
  return `node "${LOGGER_DEST}"`;
}

function isOurStatusLine(statusLine: unknown): boolean {
  if (!statusLine || typeof statusLine !== 'object') return false;
  const command = (statusLine as { command?: unknown }).command;
  return typeof command === 'string' && command.includes(LOGGER_DEST);
}

/** Point ~/.claude/settings.json's statusLine at our logger, asking first if something else is already there. */
async function wireStatusLineSetting(context: vscode.ExtensionContext): Promise<void> {
  try {
    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_FILE), { recursive: true });

    let settings: Record<string, unknown> = {};
    let raw = '';
    if (fs.existsSync(CLAUDE_SETTINGS_FILE)) {
      raw = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf8');
      try {
        settings = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        vscode.window.showErrorMessage(
          `Claude Team Usage: ~/.claude/settings.json is not valid JSON. Fix it manually, then reload — the status line was not changed.`
        );
        return;
      }
    }

    const existingStatusLine = settings.statusLine;

    if (!existingStatusLine) {
      settings.statusLine = { type: 'command', command: loggerCommandLine() };
      fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
      return;
    }

    if (isOurStatusLine(existingStatusLine)) {
      // Already wired (possibly to a stale absolute path from a moved extension install) — leave as is.
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      'Claude Team Usage wants to set your Claude Code status line to track shared-plan usage. ' +
        'A different statusLine is already configured in ~/.claude/settings.json — replace it? ' +
        'The current settings.json will be backed up to settings.json.bak first.',
      { modal: true },
      'Replace'
    );

    if (choice !== 'Replace') return;

    fs.writeFileSync(CLAUDE_SETTINGS_FILE + '.bak', raw);
    settings.statusLine = { type: 'command', command: loggerCommandLine() };
    fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
  } catch (err) {
    vscode.window.showWarningMessage(
      `Claude Team Usage: failed to update ~/.claude/settings.json — ${String(err)}`
    );
  }
}

function loadSnapshots(): Snapshot[] {
  return readLocalLog(LOCAL_LOG_FILE);
}

/** Tries the team RPC if Supabase is configured; null on any failure so callers fall back to local-only display. */
async function tryFetchTeamSlice(): Promise<TeamSlice | null> {
  try {
    const cfg = vscode.workspace.getConfiguration('claudeUsage');
    const url = (cfg.get<string>('supabaseUrl') || '').trim();
    const anonKey = (cfg.get<string>('supabaseAnonKey') || '').trim();
    if (!url || !anonKey) return null;
    return await fetchTeamSlice(url, anonKey, resolveIdentity());
  } catch {
    return null;
  }
}

/** Tries get_room_name if Supabase is configured and the account email is known; null on any failure so callers fall back to showing the email instead. */
async function tryFetchRoomName(accountEmail: string | null): Promise<string | null> {
  if (!accountEmail) return null;
  try {
    const cfg = vscode.workspace.getConfiguration('claudeUsage');
    const url = (cfg.get<string>('supabaseUrl') || '').trim();
    const anonKey = (cfg.get<string>('supabaseAnonKey') || '').trim();
    if (!url || !anonKey) return null;
    return await fetchRoomName(url, anonKey, accountEmail);
  } catch {
    return null;
  }
}

function teamSliceLine(teamSlice: TeamSlice): string {
  return `you ≈ ${formatPct(teamSlice.myPct)} of the shared 5h limit (team at ${formatPct(
    teamSlice.accountFiveHourPct
  )})`;
}

function paintStatusBar(
  item: vscode.StatusBarItem,
  summary: ReturnType<typeof summarizeCurrentWindow>,
  teamSlice: TeamSlice | null
): void {
  item.text = teamSlice
    ? `$(pulse) ${teamSliceLine(teamSlice)}`
    : `$(pulse) 5h ${formatPct(summary.accountFiveHourPct)} team · you ${formatUsd(summary.windowCostUsd)}`;

  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**Claude Room**\n\n`);
  if (teamSlice) {
    tooltip.appendMarkdown(`${teamSliceLine(teamSlice)}\n\n`);
  }
  tooltip.appendMarkdown(`5h resets in ${formatCountdown(summary.fiveHourResetsAt)}\n\n`);
  tooltip.appendMarkdown(`7d used: ${formatPct(summary.accountSevenDayPct)} (account-wide)\n\n`);
  tooltip.appendMarkdown(`Your cost this window: ${formatUsd(summary.windowCostUsd)}\n\n`);
  tooltip.appendMarkdown(
    `Your tokens this window: ${summary.windowInputTokens.toLocaleString()} in / ${summary.windowOutputTokens.toLocaleString()} out\n\n`
  );
  tooltip.appendMarkdown(`_Click for the full Claude Room panel._`);
  item.tooltip = tooltip;

  const pct = teamSlice ? teamSlice.accountFiveHourPct : summary.accountFiveHourPct;
  if (typeof pct === 'number' && pct >= 80) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (typeof pct === 'number' && pct >= 50) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    item.backgroundColor = undefined;
  }
}

async function updateStatusBar(item: vscode.StatusBarItem): Promise<void> {
  let summary: ReturnType<typeof summarizeCurrentWindow>;
  try {
    summary = summarizeCurrentWindow(loadSnapshots());
  } catch (err) {
    item.text = `$(pulse) 5h -- team`;
    item.tooltip = `Claude Room: couldn't read the local log — ${String(err)}`;
    item.backgroundColor = undefined;
    return;
  }

  // Paint the local-only view first so a slow/unreachable Supabase RPC never stalls
  // the status bar for a full tick — the team line lands as a follow-up update.
  try {
    paintStatusBar(item, summary, null);
  } catch (err) {
    item.text = `$(pulse) 5h -- team`;
    item.tooltip = `Claude Room: couldn't read the local log — ${String(err)}`;
    item.backgroundColor = undefined;
    return;
  }

  const teamSlice = await tryFetchTeamSlice();
  if (teamSlice) {
    paintStatusBar(item, summary, teamSlice);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showUsagePanel(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'claudeTeamUsage.usage',
    'Claude Room',
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  const render = async () => {
    try {
      const snapshots = loadSnapshots();
      const summary = summarizeCurrentWindow(snapshots);
      const peaks = dailyPeaks(snapshots);
      const model = latestModel(snapshots);
      const accountEmail = readClaudeAccountEmail();

      // Paint the local-only view first — Supabase may be slow or unreachable, and this
      // must never leave the panel blank while waiting on it (same reasoning as
      // updateStatusBar's local-first paint above).
      panel.webview.html = renderHtml({ summary, peaks, model, teamSlice: null, accountEmail, roomName: null });

      const [teamSlice, roomName] = await Promise.all([tryFetchTeamSlice(), tryFetchRoomName(accountEmail)]);
      if (teamSlice || roomName) {
        panel.webview.html = renderHtml({ summary, peaks, model, teamSlice, accountEmail, roomName });
      }
    } catch (err) {
      panel.webview.html = renderErrorHtml(err);
    }
  };

  render();
  const interval = setInterval(render, STATUS_BAR_UPDATE_INTERVAL_MS);
  panel.onDidDispose(() => clearInterval(interval), null, context.subscriptions);
}

function panelStyles(): string {
  return `
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    padding: 1.5em;
    max-width: 640px;
    margin: 0 auto;
  }
  h1 { font-size: 1.3em; margin: 0; }
  h2 { font-size: 1em; margin: 0 0 0.8em; color: var(--vscode-foreground); }
  .header { margin-bottom: 1.2em; }
  .title-row { display: flex; align-items: baseline; gap: 0.6em; flex-wrap: wrap; }
  .room-name { font-size: 1.1em; color: var(--vscode-descriptionForeground); }
  .account-line {
    margin-top: 0.4em;
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
  }
  .warning {
    margin-top: 0.6em;
    padding: 0.5em 0.8em;
    font-size: 0.85em;
    border-radius: 4px;
    background: var(--vscode-inputValidation-warningBackground, rgba(255, 204, 0, 0.1));
    border: 1px solid var(--vscode-inputValidation-warningBorder, transparent);
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
  }
  .card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 1.1em 1.3em;
    margin-bottom: 1.2em;
    background: var(--vscode-editorWidget-background, transparent);
  }
  .empty {
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 0.4em 0;
  }
  .slice-line {
    font-size: 0.95em;
    margin-bottom: 1em;
  }
  .row { margin-bottom: 1em; }
  .row:last-child { margin-bottom: 0; }
  .label { display: flex; justify-content: space-between; margin-bottom: 0.3em; font-size: 0.85em; }
  .label .pct { color: var(--vscode-descriptionForeground); }
  .bar-track {
    height: 8px;
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.25);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
  }
  .countdown {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    margin-top: 0.3em;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.6em 1em;
    margin-top: 1.1em;
    font-size: 0.85em;
  }
  .stat-label { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .stat-value { font-size: 1.05em; margin-top: 0.1em; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.35em 0.8em 0.35em 0; font-size: 0.85em; }
  th { border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-weight: normal; }
  td { border-bottom: 1px solid var(--vscode-panel-border); }
  tr:last-child td { border-bottom: none; }
  `;
}

function renderErrorHtml(err: unknown): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>${panelStyles()}</style></head>
<body>
  <div class="header"><h1>Claude Room</h1></div>
  <div class="card">
    <div class="empty">Couldn't load usage data — ${escapeHtml(String(err))}</div>
  </div>
</body>
</html>`;
}

function renderHtml(args: {
  summary: ReturnType<typeof summarizeCurrentWindow>;
  peaks: ReturnType<typeof dailyPeaks>;
  model: string | null;
  teamSlice: TeamSlice | null;
  accountEmail: string | null;
  roomName: string | null;
}): string {
  const { summary, peaks, model, teamSlice, accountEmail, roomName } = args;

  const bar = (pct: number | null, resetsAt: number | null, colorVar: string, label: string) => {
    const clamped = typeof pct === 'number' ? Math.max(0, Math.min(100, pct)) : 0;
    return `
      <div class="row">
        <div class="label"><span>${label}</span><span class="pct">${formatPct(pct)}</span></div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${clamped}%;background:${colorVar};"></div>
        </div>
        <div class="countdown">Resets in ${formatCountdown(resetsAt)}</div>
      </div>`;
  };

  const hasWindowData = summary.accountFiveHourPct != null;

  const usageBody = hasWindowData
    ? `
      ${
        teamSlice
          ? `<div class="slice-line">${escapeHtml(teamSliceLine(teamSlice))}</div>`
          : `<div class="slice-line empty">Team comparison unavailable — showing this device's own usage only.</div>`
      }
      ${bar(summary.accountFiveHourPct, summary.fiveHourResetsAt, 'var(--vscode-charts-blue, #3794ff)', 'Account 5h usage')}
      ${bar(summary.accountSevenDayPct, summary.sevenDayResetsAt, 'var(--vscode-charts-purple, #b180d7)', 'Account 7d usage')}
      <div class="stat-grid">
        <div><div class="stat-label">Your cost this window</div><div class="stat-value">${formatUsd(summary.windowCostUsd)}</div></div>
        <div><div class="stat-label">Your tokens</div><div class="stat-value">${summary.windowInputTokens.toLocaleString()} in / ${summary.windowOutputTokens.toLocaleString()} out</div></div>
        <div><div class="stat-label">Your sessions</div><div class="stat-value">${summary.sessionCount}</div></div>
        <div><div class="stat-label">Current model</div><div class="stat-value">${model ? escapeHtml(model) : '—'}</div></div>
      </div>`
    : `<div class="empty">Waiting for your first Claude Code session in this window.</div>`;

  const rows = peaks
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.date)}</td>
        <td>${formatPct(p.peakFiveHourPct)}</td>
        <td>${formatPct(p.peakSevenDayPct)}</td>
        <td>${formatUsd(p.costUsd)}</td>
        <td>${p.sessionCount}</td>
      </tr>`
    )
    .join('');

  const activityBody =
    peaks.length > 0
      ? `<table>
        <thead>
          <tr><th>Date</th><th>Peak 5h</th><th>Peak 7d</th><th>Your cost</th><th>Sessions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
      : `<div class="empty">No activity logged yet.</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${panelStyles()}</style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <h1>Claude Room</h1>
      ${roomName ? `<span class="room-name">${escapeHtml(roomName)}</span>` : ''}
    </div>
    ${
      accountEmail
        ? `<div class="account-line">Tracking Claude account: ${escapeHtml(accountEmail)}</div>`
        : `<div class="warning">Couldn't read your Claude account email — usage tracked as 'unknown'.</div>`
    }
  </div>

  <div class="card">
    <h2>Your usage</h2>
    ${usageBody}
  </div>

  <div class="card">
    <h2>Recent activity</h2>
    ${activityBody}
  </div>
</body>
</html>`;
}

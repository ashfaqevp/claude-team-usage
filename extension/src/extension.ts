import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  Snapshot,
  readLocalLog,
  summarizeCurrentWindow,
  dailyPeaks,
  formatUsd,
  formatPct,
  formatCountdown,
} from './usage';
import { syncLocalLog } from './sync';
import { fetchTeamSlice, TeamSlice } from './team';
import { resolveIdentity } from './identity';

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
  tooltip.appendMarkdown(`**Claude Team Usage**\n\n`);
  if (teamSlice) {
    tooltip.appendMarkdown(`${teamSliceLine(teamSlice)}\n\n`);
  }
  tooltip.appendMarkdown(`5h resets in ${formatCountdown(summary.fiveHourResetsAt)}\n\n`);
  tooltip.appendMarkdown(`7d used: ${formatPct(summary.accountSevenDayPct)} (account-wide)\n\n`);
  tooltip.appendMarkdown(`Your cost this window: ${formatUsd(summary.windowCostUsd)}\n\n`);
  tooltip.appendMarkdown(
    `Your tokens this window: ${summary.windowInputTokens.toLocaleString()} in / ${summary.windowOutputTokens.toLocaleString()} out\n\n`
  );
  tooltip.appendMarkdown(`_Click for the full usage panel._`);
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
    item.tooltip = `Claude Team Usage: couldn't read the local log — ${String(err)}`;
    item.backgroundColor = undefined;
    return;
  }

  // Paint the local-only view first so a slow/unreachable Supabase RPC never stalls
  // the status bar for a full tick — the team line lands as a follow-up update.
  try {
    paintStatusBar(item, summary, null);
  } catch (err) {
    item.text = `$(pulse) 5h -- team`;
    item.tooltip = `Claude Team Usage: couldn't read the local log — ${String(err)}`;
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
    'Claude Usage',
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  const render = async () => {
    const snapshots = loadSnapshots();
    const summary = summarizeCurrentWindow(snapshots);
    const peaks = dailyPeaks(snapshots);
    const teamSlice = await tryFetchTeamSlice();
    panel.webview.html = renderHtml(summary, peaks, teamSlice);
  };

  render();
  const interval = setInterval(render, STATUS_BAR_UPDATE_INTERVAL_MS);
  panel.onDidDispose(() => clearInterval(interval), null, context.subscriptions);
}

function renderHtml(
  summary: ReturnType<typeof summarizeCurrentWindow>,
  peaks: ReturnType<typeof dailyPeaks>,
  teamSlice: TeamSlice | null
): string {
  const bar = (pct: number | null, colorVar: string) => {
    const clamped = typeof pct === 'number' ? Math.max(0, Math.min(100, pct)) : 0;
    return `
      <div class="bar-track">
        <div class="bar-fill" style="width:${clamped}%;background:${colorVar};"></div>
      </div>`;
  };

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

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    padding: 1.5em;
  }
  h2 { margin-top: 1.5em; margin-bottom: 0.3em; }
  .row { margin-bottom: 1.2em; }
  .label { display: flex; justify-content: space-between; margin-bottom: 0.3em; font-size: 0.9em; }
  .bar-track {
    height: 10px;
    border-radius: 5px;
    background: var(--vscode-progressBar-background, #333);
    opacity: 0.3;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 5px;
  }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5em; }
  th, td { text-align: left; padding: 0.3em 0.8em 0.3em 0; font-size: 0.9em; }
  th { border-bottom: 1px solid var(--vscode-panel-border); }
  .stat { font-size: 0.9em; margin: 0.2em 0; }
</style>
</head>
<body>
  ${
    teamSlice
      ? `<h2>Team</h2>
  <div class="stat">${teamSliceLine(teamSlice)}</div>`
      : ''
  }
  <h2>This 5-hour window</h2>
  <div class="row">
    <div class="label"><span>Account 5h usage</span><span>${formatPct(summary.accountFiveHourPct)}</span></div>
    ${bar(summary.accountFiveHourPct, 'var(--vscode-charts-blue, #3794ff)')}
  </div>
  <div class="row">
    <div class="label"><span>Account 7d usage</span><span>${formatPct(summary.accountSevenDayPct)}</span></div>
    ${bar(summary.accountSevenDayPct, 'var(--vscode-charts-purple, #b180d7)')}
  </div>

  <div class="stat">Resets in: ${formatCountdown(summary.fiveHourResetsAt)}</div>
  <div class="stat">Your cost this window: ${formatUsd(summary.windowCostUsd)}</div>
  <div class="stat">Your tokens this window: ${summary.windowInputTokens.toLocaleString()} in / ${summary.windowOutputTokens.toLocaleString()} out</div>
  <div class="stat">Your sessions this window: ${summary.sessionCount}</div>

  <h2>Daily peaks (local log)</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Peak 5h</th><th>Peak 7d</th><th>Your cost</th><th>Sessions</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5">No data yet.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

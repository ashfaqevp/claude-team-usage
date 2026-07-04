// Reads the Claude account email that identifies this device's Room. The extension
// does no filtering or access control with this value — it only reads and attaches it
// so synced snapshots can be grouped into Rooms server-side.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLAUDE_CONFIG_FILE = path.join(os.homedir(), '.claude.json');

// Refreshed no more than once per this interval, matching the extension's existing
// 30s sync tick — so a mid-session account switch is picked up within 30s, without
// reading the file on every render or setting up a file watcher.
const CACHE_TTL_MS = 30_000;

let cachedEmail: string | null = null;
let cachedAt = 0;

/**
 * oauthAccount.emailAddress is undocumented internal Claude Code storage, read
 * best-effort — a future Claude Code release could move or rename it, in which case
 * this should be updated; until then any failure here safely falls back to null.
 */
function readEmailFromDisk(): string | null {
  try {
    const raw = fs.readFileSync(CLAUDE_CONFIG_FILE, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      try {
        const email = (parsed as { oauthAccount?: { emailAddress?: unknown } })?.oauthAccount?.emailAddress;
        return typeof email === 'string' && email.trim() ? email.trim() : null;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** Returns the Claude account email for this device, or null if it can't be read. */
export function readClaudeAccountEmail(): string | null {
  const now = Date.now();
  if (now - cachedAt >= CACHE_TTL_MS) {
    cachedEmail = readEmailFromDisk();
    cachedAt = now;
  }
  return cachedEmail;
}

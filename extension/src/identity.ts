// Resolves a human-readable label for "whose usage is this" so team snapshots can be
// grouped in Supabase. This is identity for LABELING ONLY — inserts go through the
// anon key with no login/auth involved, so nothing here should be treated as a
// credential or a guarantee that the label is accurate.
//
// Priority: config override > git global email/name > a generated per-machine device id.
// Resolved once and cached in memory for the process lifetime — callers must not
// re-run `git config` on every timer tick.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

const DEVICE_ID_FILE = path.join(os.homedir(), '.claude', 'team-usage', 'device-id.txt');

let cachedIdentity: string | null = null;

export function resolveIdentity(): string {
  if (cachedIdentity == null) {
    cachedIdentity = computeIdentity();
  }
  return cachedIdentity;
}

function computeIdentity(): string {
  try {
    const override = vscode.workspace.getConfiguration('claudeUsage').get<string>('userNameOverride');
    if (override && override.trim()) return override.trim();
  } catch {
    // Fall through to git/device identity.
  }

  return tryGitIdentity() ?? deviceIdentity();
}

function tryGitIdentity(): string | null {
  try {
    const email = execSync('git config --global user.email', { encoding: 'utf8' }).trim();
    if (!email) return null;

    let name = '';
    try {
      name = execSync('git config --global user.name', { encoding: 'utf8' }).trim();
    } catch {
      name = '';
    }

    return name ? `${name} <${email}>` : email;
  } catch {
    return null;
  }
}

function deviceIdentity(): string {
  try {
    fs.mkdirSync(path.dirname(DEVICE_ID_FILE), { recursive: true });

    let id = fs.existsSync(DEVICE_ID_FILE) ? fs.readFileSync(DEVICE_ID_FILE, 'utf8').trim() : '';
    if (!id) {
      id = crypto.randomUUID();
      fs.writeFileSync(DEVICE_ID_FILE, id);
    }

    return `device-${id.slice(0, 8)}`;
  } catch {
    return 'device-unknown';
  }
}

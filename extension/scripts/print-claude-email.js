#!/usr/bin/env node
// Standalone check for readClaudeAccountEmail()'s logic (src/claudeAccount.ts), runnable
// without a TypeScript compile step. Mirrors that function's read path exactly — update
// both if the field ever moves. Usage: node scripts/print-claude-email.js

const fs = require('fs');
const os = require('os');
const path = require('path');

function readClaudeAccountEmail() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8');
    try {
      const parsed = JSON.parse(raw);
      try {
        const email = parsed && parsed.oauthAccount && parsed.oauthAccount.emailAddress;
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

console.log(readClaudeAccountEmail());

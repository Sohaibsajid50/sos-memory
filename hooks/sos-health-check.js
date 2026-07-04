#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { healthCheck } = require('../src/health-check');

const MIN_INTERVAL_MS = 5 * 60 * 1000;

function readHookInput() {
  try {
    // fd 0 works on macOS/Linux/Windows, unlike /dev/stdin.
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (_) {
    return {};
  }
}

function statePath() {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'cache', 'sos-plugin-health-hook.json');
}

function isMemorySensitive(input) {
  const toolName = input.tool_name || process.env.CLAUDE_TOOL_NAME || '';
  const toolInput = input.tool_input || input;
  const cwd = input.cwd || process.cwd();
  const filePath = toolInput.file_path || '';
  const command = toolInput.command || '';
  const target = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath || '.');

  if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
    return [
      'FOLDER-RULES.md',
      'AGENTS.md',
      'GEMINI.md',
      'CLAUDE.md',
      '.claude/projects.json',
      '/vault/Daily/',
      '/vault/Projects/',
      '/vault/Intelligence/decisions/',
      '.claude/sessions/'
    ].some((marker) => target.includes(marker));
  }

  if (toolName === 'Bash') {
    return /\b(qmd|continues|session-save|notebooklm|mkdir|touch|cp|mv)\b/.test(command);
  }

  return false;
}

function shouldRunHook(input) {
  if (!process.argv.includes('--hook')) return true;
  if (!isMemorySensitive(input)) return false;

  const target = statePath();
  try {
    const state = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (Date.now() - (state.lastRunAt || 0) < MIN_INTERVAL_MS) return false;
  } catch (_) {}

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({
    lastRunAt: Date.now(),
    lastRunIso: new Date().toISOString()
  }, null, 2) + '\n');
  return true;
}

const input = readHookInput();
if (!shouldRunHook(input)) process.exit(0);

healthCheck({ repair: process.argv.includes('--repair') }).catch((error) => {
  console.error(`[sos-health] ${error.message}`);
  process.exitCode = 1;
});

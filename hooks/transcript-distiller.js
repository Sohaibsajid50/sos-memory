#!/usr/bin/env node
/**
 * Transcript distiller — run by the scheduler (launchd/systemd/cron).
 *
 * Finds finished AI CLI sessions (Claude Code, Codex; Gemini slot ready),
 * distills each into a few bullets via a headless `claude -p` call, and
 * appends them to the vault daily note under the registry-resolved project
 * section. Retrieval layers (QMD/GBrain) pick them up from the vault.
 *
 * Never backfills history: first run records a cutoff and exits.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  CLAUDE_CONFIG_DIR,
  appendToDailySection,
  findBinary,
  readRegistry,
  readStateJson,
  resolveProject,
  stagePendingDigest,
  writeStateJson
} = require('./_common');

const STATE_FILE = 'transcript-distiller-state.json';
const LOG_PATH = path.join(CLAUDE_CONFIG_DIR, 'cache', 'transcript-distiller.log');
const DISTILL_MODEL = process.env.SOS_DISTILL_MODEL || 'claude-haiku-4-5-20251001';

// Skip sessions still being written; cap work per run; cap transcript size.
const QUIET_MS = 30 * 60 * 1000;
const MAX_SESSIONS_PER_RUN = 10;
const MAX_ATTEMPTS = 3;
const PAUSE_BETWEEN_CALLS_MS = 3000;
const HEAD_CHARS = 8000;
const TAIL_CHARS = 32000;
const MIN_TRANSCRIPT_CHARS = 400;

// Loop guard: headless distill sessions contain this marker and are skipped.
const SENTINEL = 'SOS-TRANSCRIPT-DISTILLER';

// Subscription/usage limits surface as CLI output (sometimes with exit 0).
// They are retryable and must never be saved as digests or burn attempts.
const RATE_LIMIT_PATTERN = /session limit|usage limit|rate limit|resets \d{1,2}[:.]?\d{0,2}\s*(am|pm)?/i;

function log(message) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${message}\n`);
}

function walkFiles(dir, suffix) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith(suffix)) results.push(full);
    }
  }
  return results;
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parseClaudeTranscript(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const turns = [];
  let cwd = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (!cwd && typeof entry.cwd === 'string') cwd = entry.cwd;
    if (entry.isSidechain) continue;
    const role = entry.message && entry.message.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = textFromContent(entry.message.content);
    if (text.trim()) turns.push(`${role.toUpperCase()}: ${text.trim()}`);
  }
  return { cwd, text: turns.join('\n\n'), agent: 'Claude Code' };
}

function parseCodexTranscript(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const turns = [];
  let cwd = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_) {
      continue;
    }
    const payload = entry.payload || {};
    if (entry.type === 'session_meta' && typeof payload.cwd === 'string') {
      cwd = payload.cwd;
      continue;
    }
    const role = payload.role || payload.type;
    const isUser = role === 'user' || role === 'user_message';
    const isAgent = role === 'assistant' || role === 'agent_message';
    if (!isUser && !isAgent) continue;
    const text =
      textFromContent(payload.content) || payload.message || payload.text || '';
    if (typeof text === 'string' && text.trim()) {
      turns.push(`${isUser ? 'USER' : 'ASSISTANT'}: ${text.trim()}`);
    }
  }
  return { cwd, text: turns.join('\n\n'), agent: 'Codex' };
}

const SOURCES = [
  { root: path.join(CLAUDE_CONFIG_DIR, 'projects'), parse: parseClaudeTranscript },
  { root: path.join(os.homedir(), '.codex', 'sessions'), parse: parseCodexTranscript }
  // Gemini CLI: add { root, parse: parseGeminiTranscript } when it ships transcripts.
];

function truncateTranscript(text) {
  if (text.length <= HEAD_CHARS + TAIL_CHARS) return text;
  return `${text.slice(0, HEAD_CHARS)}\n\n[... middle truncated ...]\n\n${text.slice(-TAIL_CHARS)}`;
}

function distill(claudeBin, transcriptText) {
  const prompt = [
    `${SENTINEL}: You are summarizing an AI coding session transcript.`,
    'Output ONLY markdown: 3-6 concise bullets of what was done/decided,',
    'then one final line starting with "**Next**:" for the follow-up (or "none").',
    'Never include credentials, API keys, tokens, or file dumps.',
    'No preamble, no headings.'
  ].join(' ');
  // Lean flags: no MCP servers, no session persistence (also prevents
  // distiller-distilling-distiller loops), no skills.
  const leanFlags = ['--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'];
  return execFileSync(claudeBin, ['-p', prompt, '--model', DISTILL_MODEL, ...leanFlags], {
    input: truncateTranscript(transcriptText),
    encoding: 'utf8',
    timeout: 300000
  }).trim();
}

/**
 * Write the digest into the vault; on permission failure (macOS TCC grants
 * for launchd node break on node upgrades) stage it for the session hooks
 * to flush with full user permissions.
 */
function deliverDigest(registry, sessionDate, section, agent, summary) {
  const dateSlug = sessionDate.toISOString().slice(0, 10);
  const time = sessionDate.toTimeString().slice(0, 5);
  const block = `\n### Session digest — ${agent} ${time}\n${summary}\n`;
  try {
    return { target: appendToDailySection(registry.vault_root, dateSlug, section, block), staged: false };
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    return { target: stagePendingDigest(dateSlug, section, block), staged: true };
  }
}

function main() {
  const registry = readRegistry();
  if (!registry) {
    log('FATAL: could not load registry');
    process.exitCode = 1;
    return;
  }
  const claudeBin = findBinary('claude');
  if (!claudeBin) {
    log('skipped: claude binary not found');
    return;
  }

  const now = Date.now();
  const state = readStateJson(STATE_FILE, null);
  if (!state) {
    writeStateJson(STATE_FILE, { cutoff: now, files: {} });
    log('initialized state; no backfill');
    return;
  }

  let processed = 0;
  for (const source of SOURCES) {
    if (processed >= MAX_SESSIONS_PER_RUN) break;
    for (const filePath of walkFiles(source.root, '.jsonl')) {
      if (processed >= MAX_SESSIONS_PER_RUN) break;
      let mtime;
      try {
        mtime = fs.statSync(filePath).mtimeMs;
      } catch (_) {
        continue;
      }
      const record = state.files[filePath] || { seenMtime: state.cutoff, attempts: 0 };
      if (mtime <= record.seenMtime || now - mtime < QUIET_MS) continue;
      if (record.attempts >= MAX_ATTEMPTS) {
        state.files[filePath] = { seenMtime: mtime, attempts: 0 };
        log(`gave up on ${path.basename(filePath)} after ${MAX_ATTEMPTS} attempts`);
        continue;
      }
      try {
        const parsed = source.parse(filePath);
        if (parsed.text.length < MIN_TRANSCRIPT_CHARS || parsed.text.includes(SENTINEL)) {
          state.files[filePath] = { seenMtime: mtime, attempts: 0 };
          continue;
        }
        if (processed > 0) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PAUSE_BETWEEN_CALLS_MS);
        }
        const summary = distill(claudeBin, parsed.text);
        if (!summary) throw new Error('empty summary from distill call');
        if (RATE_LIMIT_PATTERN.test(summary.slice(0, 300))) {
          log(`rate-limited (“${summary.slice(0, 80)}”) — stopping this run; will retry next hour`);
          break;
        }
        const project = parsed.cwd ? resolveProject(registry, parsed.cwd) : null;
        const section = project ? project.daily_section : 'General';
        const delivery = deliverDigest(registry, new Date(mtime), section, parsed.agent, summary);
        state.files[filePath] = { seenMtime: mtime, attempts: 0 };
        processed += 1;
        log(`distilled ${path.basename(filePath)} (${parsed.agent}) -> ${delivery.staged ? 'STAGED ' : ''}${delivery.target} [${section}]`);
      } catch (error) {
        const output = `${error.stdout || ''}${error.stderr || ''}`;
        if (RATE_LIMIT_PATTERN.test(output)) {
          log('rate-limited (from error output) — stopping this run; will retry next hour');
          break;
        }
        state.files[filePath] = { seenMtime: record.seenMtime, attempts: record.attempts + 1 };
        const stderr = error.stderr ? ` | stderr: ${String(error.stderr).slice(0, 300)}` : '';
        log(`ERROR ${filePath}: ${error.message}${stderr}`);
      }
    }
  }
  writeStateJson(STATE_FILE, state);
  log(`run complete: ${processed} session(s) distilled`);
}

main();

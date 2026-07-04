#!/usr/bin/env node
/**
 * GBrain registry-driven sync — run by the scheduler (launchd/systemd/cron).
 *
 * Imports every registered source folder into the GBrain brain (one-way:
 * filesystem -> brain). The vault and project folders remain the canonical
 * record; the brain is a derived, rebuildable index.
 *
 * Requires: gbrain on PATH (or a well-known install dir). The scheduler
 * template provides OPENROUTER_API_KEY when local-Ollama chat is configured.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { findBinary, readRegistry } = require('./_common');

const GBRAIN_HOME = path.join(os.homedir(), '.gbrain');
const LOG_PATH = path.join(GBRAIN_HOME, 'logs', 'gbrain-sync.log');
const LOCK_PATH = path.join(GBRAIN_HOME, 'gbrain-sync.lock');
const LOCK_STALE_MS = 60 * 60 * 1000;
const STEP_TIMEOUT_MS = 30 * 60 * 1000;

function log(message) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${message}\n`);
}

/** Keep only top-level sources; drop sources nested inside another source. */
function dedupeNestedSources(sources) {
  const resolved = [...new Set(sources.map((source) => path.resolve(source)))];
  return resolved.filter((candidate) =>
    !resolved.some(
      (other) => other !== candidate && candidate.startsWith(other + path.sep)
    )
  );
}

function acquireLock() {
  try {
    const stat = fs.statSync(LOCK_PATH);
    if (Date.now() - stat.mtimeMs < LOCK_STALE_MS) return false;
    fs.unlinkSync(LOCK_PATH);
  } catch (_) {}
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch (_) {}
}

function main() {
  const gbrainBin = findBinary('gbrain');
  if (!gbrainBin) {
    log('skipped: gbrain binary not found');
    return;
  }

  const registry = readRegistry();
  if (!registry) {
    log('skipped: no registry');
    return;
  }

  if (!acquireLock()) {
    log('skipped: another sync is running');
    return;
  }

  const runGbrain = (args) => {
    const output = execFileSync(gbrainBin, args, {
      encoding: 'utf8',
      timeout: STEP_TIMEOUT_MS,
      env: { ...process.env, PATH: `${path.dirname(gbrainBin)}${path.delimiter}${process.env.PATH || ''}` }
    });
    const summary = output.trim().split('\n').slice(-2).join(' | ');
    log(`gbrain ${args.join(' ')} -> ${summary}`);
  };

  try {
    const sources = dedupeNestedSources(
      registry.projects.map((project) => project.source).filter(Boolean)
    ).filter((source) => fs.existsSync(source));

    for (const source of sources) {
      try {
        runGbrain(['import', source, '--no-embed']);
      } catch (error) {
        log(`ERROR importing ${source}: ${error.message}`);
      }
    }
    runGbrain(['embed', '--stale']);
    runGbrain(['extract', 'all', '--source', 'db']);
    log('sync complete');
  } catch (error) {
    log(`FATAL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

main();

/**
 * `sos doctor` — one command that verifies the whole memory system, including
 * every failure mode hit during the reference deployment (2026-07).
 */

const fs = require('fs');
const path = require('path');
const { detectPlatform } = require('./platform');
const { loadConfig } = require('./config');
const { detectGbrain, detectOllama, detectPostgres, detectQmd } = require('./detect');
const { doctorChecks, findStaleServeProcesses } = require('./gbrain');
const { healthCheck } = require('./health-check');
const { readRegistry } = require('../hooks/_common');

function report(check) {
  const mark = check.ok ? 'OK  ' : 'FAIL';
  console.log(`[${mark}] ${check.id}: ${check.detail}`);
  return check.ok;
}

/**
 * Scheduled jobs run outside the terminal's permission context: on macOS a
 * launchd `node` gets its own TCC identity, and a denied "access Documents"
 * pop-up turns into silent EPERM failures. Writing a probe file to the vault
 * from THIS process only proves the interactive context, so surface the
 * distiller's own error log as the real evidence.
 */
function vaultWriteChecks(registry) {
  const checks = [];
  if (!registry) return checks;

  const probePath = path.join(registry.vault_root, '.sos-doctor-probe');
  let interactiveWrite = false;
  try {
    fs.writeFileSync(probePath, String(Date.now()));
    fs.unlinkSync(probePath);
    interactiveWrite = true;
  } catch (_) {}
  checks.push({
    id: 'vault_write_interactive',
    ok: interactiveWrite,
    detail: interactiveWrite ? 'vault writable from this shell' : `cannot write ${registry.vault_root}`
  });

  const distillerLog = path.join(
    process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude'),
    'cache',
    'transcript-distiller.log'
  );
  if (fs.existsSync(distillerLog)) {
    const recent = fs.readFileSync(distillerLog, 'utf8').split('\n').slice(-50);
    const eperm = recent.filter((line) => /EPERM|not permitted/.test(line));
    checks.push({
      id: 'scheduled_jobs_vault_access',
      ok: eperm.length === 0,
      detail: eperm.length === 0
        ? 'no recent permission errors in distiller log'
        : `${eperm.length} recent EPERM error(s) — grant node Full Disk Access (macOS: System Settings > Privacy & Security)`
    });
  }
  return checks;
}

/**
 * Scheduled jobs can die silently (TCC EPERM before the first log line kept
 * two jobs dead for 8 days with zero errors anywhere). Freshness = the job's
 * own log advanced recently; anything else is a lie.
 */
function jobFreshnessChecks(config) {
  const checks = [];
  const gbrainLogs = path.join(require('os').homedir(), '.gbrain', 'logs');
  const ageHours = (filePath) => {
    try {
      return (Date.now() - fs.statSync(filePath).mtimeMs) / 3600000;
    } catch (_) {
      return Infinity;
    }
  };

  if (config && config.retrieval && config.retrieval.gbrain) {
    const syncAge = ageHours(path.join(gbrainLogs, 'gbrain-sync.log'));
    checks.push({
      id: 'job_fresh_gbrain_sync',
      ok: syncAge < 3,
      detail: syncAge === Infinity ? 'no log — job never ran' : `last activity ${syncAge.toFixed(1)}h ago (hourly job; >3h = dead or blocked)`
    });
    const dreamAge = ageHours(path.join(gbrainLogs, 'dream-last-success'));
    checks.push({
      id: 'job_fresh_gbrain_dream',
      ok: dreamAge < 96,
      detail: dreamAge === Infinity ? 'never succeeded' : `last success ${(dreamAge / 24).toFixed(1)}d ago (>4d = investigate)`
    });
  }
  const pendingDir = path.join(
    process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude'),
    'cache', 'pending-digests'
  );
  let pendingCount = 0;
  try {
    pendingCount = fs.readdirSync(pendingDir).filter((name) => name.endsWith('.md')).length;
  } catch (_) {}
  checks.push({
    id: 'pending_digests_backlog',
    ok: pendingCount < 25,
    detail: pendingCount === 0
      ? 'none staged'
      : `${pendingCount} staged digest(s) awaiting a session-hook flush${pendingCount >= 25 ? ' — session hooks may not be flushing' : ''}`
  });

  if (config && config.distiller && config.distiller.enabled) {
    const distillerAge = ageHours(path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude'),
      'cache', 'transcript-distiller.log'
    ));
    checks.push({
      id: 'job_fresh_transcript_distiller',
      ok: distillerAge < 3,
      detail: distillerAge === Infinity ? 'no log — job never ran' : `last activity ${distillerAge.toFixed(1)}h ago (hourly job; >3h = dead or blocked)`
    });
  }
  return checks;
}

async function doctor() {
  const platformInfo = detectPlatform();
  const config = loadConfig();
  const registry = readRegistry();
  console.log(`platform=${platformInfo.os} scheduler=${platformInfo.scheduler} ram=${platformInfo.totalRamGb}GB profile=${config ? config.profile : 'no config'}`);

  let allOk = true;
  const track = (check) => { allOk = report(check) && allOk; };

  track({
    id: 'registry',
    ok: Boolean(registry),
    detail: registry ? `${registry.projects.length} project(s)` : 'missing or invalid — run sos install'
  });

  vaultWriteChecks(registry).forEach(track);
  jobFreshnessChecks(config).forEach(track);

  if (config && config.retrieval && config.retrieval.qmd) {
    const qmd = detectQmd();
    track({ id: 'qmd_installed', ok: qmd.found, detail: qmd.found ? qmd.path : qmd.guidance });
  }

  if (config && config.retrieval && config.retrieval.gbrain) {
    const gbrain = detectGbrain();
    const ollama = detectOllama();
    const postgres = detectPostgres(config.gbrain.databaseUrl);
    const requiredModels = [
      config.gbrain.embeddingModel && config.gbrain.embeddingModel.replace(/^ollama:/, ''),
      config.gbrain.thinkModel,
      config.gbrain.cycleModel
    ].filter(Boolean);
    doctorChecks({ gbrain, ollama, postgres, requiredModels: [...new Set(requiredModels)] }).forEach(track);

    const stale = findStaleServeProcesses();
    track({
      id: 'gbrain_stale_serves',
      ok: stale.length === 0,
      detail: stale.length === 0
        ? 'no day-old serve processes'
        : `${stale.length} gbrain serve process(es) older than a day (pids ${stale.map((proc) => proc.pid).join(', ')}) — likely forgotten sessions holding resources`
    });
  }

  console.log('--- registry/vault/qmd deep check ---');
  await healthCheck({ repair: false });

  console.log(allOk ? 'doctor: all checks passed' : 'doctor: issues found (see FAIL lines)');
  return allOk;
}

module.exports = { doctor };

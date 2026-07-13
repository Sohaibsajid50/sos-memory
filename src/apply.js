/**
 * `sos apply` — materialize the system described by ~/.sos/sos.config.json:
 * provisioning plan, registry, gbrain file-plane config + models, scheduler
 * jobs, and MCP registration. Idempotent: run it after any config change.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectPlatform } = require('./platform');
const { loadConfig, defaultConfig, saveConfig, validateConfig, CONFIG_PATH } = require('./config');
const { provisioningPlan, formatPlan } = require('./provision');
const { installJobs } = require('./scheduler');
const gbrainIntegration = require('./gbrain');
const { findInCandidates } = require('./detect');
const { writeFileWithBackup } = require('./fs-utils');

const REPO_HOOKS_DIR = path.join(__dirname, '..', 'hooks');
const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
// Scheduled jobs MUST run hook copies from ~/.claude, never from the repo:
// the repo usually lives under ~/Documents, and launchd-spawned node gets
// TCC EPERM opening scripts inside protected folders (observed live — jobs
// died silently for 8 days). ~/.claude is outside TCC scope.
const INSTALLED_HOOKS_DIR = path.join(CLAUDE_CONFIG_DIR, 'hooks');

function syncInstalledHooks(dryRun) {
  if (dryRun) return { copied: [] };
  fs.mkdirSync(INSTALLED_HOOKS_DIR, { recursive: true });
  const copied = [];
  // Sync every repo hook: scheduled jobs AND session hooks must run the
  // repo's current logic (session hooks flush staged digests, so they are
  // part of the delivery pipeline, not just convenience).
  const hookFiles = fs.readdirSync(REPO_HOOKS_DIR).filter((name) => name.endsWith('.js'));
  for (const name of hookFiles) {
    const source = path.join(REPO_HOOKS_DIR, name);
    const target = path.join(INSTALLED_HOOKS_DIR, name);
    const sourceContent = fs.readFileSync(source, 'utf8');
    const targetContent = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (sourceContent !== targetContent) {
      fs.writeFileSync(target, sourceContent);
      copied.push(name);
    }
  }
  return { copied };
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

function registerClaudeMcp(commands, dryRun) {
  if (dryRun) return { ran: false, command: commands.claude };
  const claudeBin = findInCandidates('claude');
  if (!claudeBin) return { ran: false, command: commands.claude, error: 'claude not found' };
  spawnSync(claudeBin, ['mcp', 'remove', '--scope', 'user', 'gbrain'], { encoding: 'utf8' });
  const parts = commands.claude.split(' ').slice(1); // strip leading "claude"
  const add = spawnSync(claudeBin, parts, { encoding: 'utf8', timeout: 60000 });
  return { ran: add.status === 0, command: commands.claude, error: add.status === 0 ? null : add.stderr.trim() };
}

async function ensureCodexMcp(commands, dryRun) {
  const configToml = path.join(os.homedir(), '.codex', 'config.toml');
  if (!fs.existsSync(configToml)) return { ran: false, reason: 'no ~/.codex/config.toml' };
  const current = fs.readFileSync(configToml, 'utf8');
  if (current.includes('[mcp_servers.gbrain]')) return { ran: false, reason: 'already registered' };
  if (dryRun) return { ran: false, reason: 'dry-run', block: commands.codexToml };
  await writeFileWithBackup(configToml, `${current.trimEnd()}\n\n${commands.codexToml}\n`);
  return { ran: true };
}

async function apply({ dryRun = false } = {}) {
  const platformInfo = detectPlatform();
  let config = loadConfig();
  if (!config) {
    config = defaultConfig(platformInfo);
    saveConfig(config);
    log(`[apply] No config found — wrote defaults to ${CONFIG_PATH}. Review it, then re-run sos apply.`);
    return { firstRun: true, config };
  }
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`Invalid config: ${errors.join('; ')}`);

  log(`[apply] platform=${platformInfo.os}/${platformInfo.arch} ram=${platformInfo.totalRamGb}GB scheduler=${platformInfo.scheduler} profile=${config.profile}`);

  // Ensure the SOS-owned ollama service (with the context cap) BEFORE the
  // provisioning gate: a stopped daemon hides installed models, which would
  // otherwise wedge apply on "missing" components that only need a start.
  if (config.retrieval.gbrain && !dryRun) {
    const ollamaBin = findInCandidates('ollama');
    if (ollamaBin) {
      const capResult = gbrainIntegration.ensureOllamaContextCap({ ollamaBin });
      log(`[apply] ollama service/context cap: ${capResult.alreadySet ? 'already set' : capResult.installed ? 'installed' : capResult.guidance || capResult.error || 'pending'}`);
      if (capResult.installed) {
        // Give the daemon a moment before probing models.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
      }
    }
  }

  const plan = provisioningPlan(config, platformInfo);
  const missing = plan.steps.filter((step) => step.needed);
  log(formatPlan(plan));
  if (missing.length > 0) {
    log(`[apply] ${missing.length} component(s) missing. Run the INSTALL commands above, then re-run sos apply.`);
    return { provisioned: false, missing: missing.map((step) => step.component) };
  }

  const results = { provisioned: true };

  if (config.retrieval.gbrain) {
    const gbrainBin = plan.detections.gbrain.path;
    if (!dryRun) {
      gbrainIntegration.ensureFilePlaneConfig({ embeddingModel: config.gbrain.embeddingModel });
      results.models = gbrainIntegration.setModelConfig(gbrainBin, {
        thinkModel: config.gbrain.thinkModel,
        cycleModel: config.gbrain.cycleModel
      });
      log('[apply] gbrain file-plane config + model split written');
    }

    const hookSync = syncInstalledHooks(dryRun);
    if (hookSync.copied.length) log(`[apply] hooks synced to ${INSTALLED_HOOKS_DIR}: ${hookSync.copied.join(', ')}`);

    // Prefer the stable PATH symlink over process.execPath: the latter is a
    // versioned Cellar path on Homebrew installs and breaks on node upgrades.
    const jobs = gbrainIntegration.jobSpecs({
      nodeBin: findInCandidates('node') || process.execPath,
      gbrainBin,
      ollamaBin: plan.detections.ollama.path,
      hooksDir: INSTALLED_HOOKS_DIR,
      cycleModel: config.gbrain.cycleModel,
      thinkModel: config.gbrain.thinkModel
    }).filter((job) => job.id !== 'transcript-distiller' || config.distiller.enabled);

    results.scheduler = installJobs(jobs, {
      scheduler: platformInfo.scheduler,
      logDir: path.join(os.homedir(), '.gbrain', 'logs'),
      dryRun
    });
    log(`[apply] scheduler=${results.scheduler.scheduler}: ${jobs.map((job) => job.id).join(', ')}${dryRun ? ' (dry-run)' : ''}`);

    const commands = gbrainIntegration.mcpRegistrationCommands({ gbrainBin });
    if (config.agents.claude) {
      results.claudeMcp = registerClaudeMcp(commands, dryRun);
      log(`[apply] claude MCP: ${results.claudeMcp.ran ? 'registered' : results.claudeMcp.error || results.claudeMcp.command}`);
    }
    if (config.agents.codex) {
      results.codexMcp = await ensureCodexMcp(commands, dryRun);
      log(`[apply] codex MCP: ${results.codexMcp.ran ? 'registered' : results.codexMcp.reason}`);
    }
  }

  log('[apply] done. Run `sos doctor` to verify.');
  return results;
}

module.exports = { apply };

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

    const jobs = gbrainIntegration.jobSpecs({
      nodeBin: process.execPath,
      gbrainBin,
      ollamaBin: plan.detections.ollama.path,
      hooksDir: REPO_HOOKS_DIR,
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
